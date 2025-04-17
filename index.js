const express = require('express')
const HTMLParser = require('node-html-parser');
const html_entity_decode = require("./html_entity_decode");
const app = express()
const port = 3000

const fs = require('fs');
const validate_mapping = (mapping) => {
    if (!Array.isArray(mapping)) {
        throw new Error('Mapping is not an array');
    }
    for (let i = 0; i < mapping.length; i++) {
        if (typeof mapping[i] !== 'object') {
            throw new Error('Mapping is not an object');
        } else if (typeof mapping[i].name !== 'string' || typeof mapping[i].manage_url === undefined ||
            typeof mapping[i].username === undefined || typeof mapping[i].password === undefined) {
            throw new Error('Mapping is not valid');
        }
    }
    return mapping;
}
const read_mapping = () => {
    const mapping_json = process.env.MAPPING_JSON;
    if (mapping_json) {
        return validate_mapping(JSON.parse(mapping_json));
    }
    const mapping_file = process.env.MAPPING_FILE || '/etc/npm_home_mapping.json';
    if (fs.existsSync(mapping_file)) {
        const data = fs.readFileSync(mapping_file, 'utf8');
        return validate_mapping(JSON.parse(data));
    }
    throw new Error('Mapping not found. Please set MAPPING_JSON or MAPPING_FILE environment variable.');
}

const npm_mapping = read_mapping();

class NpmInstance {
    constructor(name, manage_url, username, password, fetch_info, suffixes) {
        this.name = name;
        this.manage_url = manage_url;
        this.username = username;
        this.password = password;
        this.fetch_info = fetch_info;
        this.suffixes = suffixes;
        this.site_info = {};
        this.fetching = {}
    }
    async init_tokens() {
        const url = new URL('api/tokens', this.manage_url);
        const data = { identity: this.username, secret: this.password };
        const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        try {
            const response = await fetch(url, options);
            const json = await response.json();
            this._token = json['token'];
            const expires = json['expires'];
            const now = new Date();
            const expires_date = new Date(expires);
            const diff = expires_date - now;
            if (diff < 0) {
                throw new Error('Token expired');
            }
            console.log(`Token for ${this.name} expires in ${diff} ms`);
            setTimeout(() => {
                this.init_tokens();
            }, diff);
        } catch (e) {
            console.error(`Error fetching token for ${this.name}: ${e}`);
            throw new Error('Cannot fetch token for npm instance: ' + this.name + ' : ' + this.manage_url);
        }
    }
    async fetch() {
        if (!this._token || this._expires_date < new Date()) {
            await this.init_tokens();
        }
        const url = new URL('/api/nginx/proxy-hosts', this.manage_url);
        const options = { headers: new Headers({ 'Authorization': `Bearer ${this._token}` }) };
        const response = await fetch(url, options);
        const json = await response.json();
        const sites = {}
        for (const item of json) {
            if (!item.enabled) continue;
            if (item.domain_names && Array.isArray(item.domain_names) && item.domain_names.length > 0) {
                sites[item.id] = {
                }
                sites[item.id].hosts = item.domain_names.map((host) => {
                    host = host.trim();
                    let suffixed = host;
                    for (const suffix of this.suffixes) {
                        if (host.endsWith(suffix)) {
                            suffixed = host.slice(0, -suffix.length);
                            break;
                        }
                    }
                    return {
                        host, suffixed
                    }
                })
            }
        }
        if (this.fetch_info) {
            for (const id in sites) {
                if (!this.site_info[id]) {
                    this.fetch_site_info(id, sites[id].hosts[0].host);
                } else {
                    sites[id].icon = this.site_info[id].icon;
                    sites[id].title = this.site_info[id].title;
                }
            }
        }
        return { instance: this, sites };
    }
    async fetch_site_info(id, host) {
        if (this.fetching[id]) {
            return;
        }
        this.fetching[id] = true;
        this.site_info[id] = await this.fetch_and_parse(host)
    }

    async fetch_and_parse(host) {
        try {
            const url = new URL(`https://${host}/`);
            const response = await fetch(url);
            if (!response.ok ) { return { title: null, icon: null }; }
            const text = await response.text();
            var root = HTMLParser.parse(text);
            let title = null;
            let icon = null;
            try {
                icon = root.querySelector('link[rel="shortcut icon"]').getAttribute('href');
                icon = new URL(icon, url).href;
            } catch (e) { }
            if (!icon ) {
                try {
                    icon = root.querySelector('link[rel="icon"]').getAttribute('href');
                    icon = new URL(icon, url).href;
                } catch (e) { }
            }
            try {
                title = html_entity_decode(root.querySelector('head > title').innerText);
            } catch (e) {
                console.error("Error parsing title for site: " + host, e);
            };
            return { title, icon };
        }
        catch (e) { console.error("Fetching data failed for site: " + host, e) };
    }
}
const instances = npm_mapping.map((item) => {
    return new NpmInstance(item.name, item.manage_url, item.username, item.password, item.fetch_info || false, item.suffixes || []);
});
Promise.all(instances.map((instance) => instance.init_tokens())).then(() => {
    console.log('All tokens initialized');
    app.get('/', (req, res) => {
        Promise.all(instances.map((instance) => instance.fetch())).then((results) => {
            const rst = [];
            for (const result of results) {
                const instance = result.instance;
                const sites = result.sites;
                rst.push({ name: instance.name, sites: Object.values(sites), murl: instance.manage_url });
            };
            res.render("index", { 'rst': rst });
        });
    })
    app.set('view engine', 'ejs')
    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`)
    })
    for (const instance of instances){
        if (instance.fetch_info) instance.fetch();
    }
})

