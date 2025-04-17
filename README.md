# npm-home
create home page from nginx proxy manager (NPM)

# Screenshot
![alt text](https://github.com/wsmlby/npm-home/blob/main/npmhome.png?raw=true)

# RUN
first, create a mapping file somewhere contains:
```
[
    {
        "name": "Intra",
        "manage_url": "https://ng.example1.com/",
        "username": "admin@example.com",
        "password": "examplepwd",
        "suffixes": [
            ".proxy.example1.com", ".example1.com"
        ],
        "fetch_info": true
    },
    {
        "name": "Intra",
        "manage_url": "https://ng.example2.com/",
        "username": "admin@example2.com",
        "password": "examplepwd",
        "suffixes": [
            ".example2.com"
        ],
        "fetch_info": true
    },
]
```
Run this on docker:
`docker run -v /<pathtoyourjsonfolder>/mapping.json:/etc/npm_home_mapping.json wsmlby/npmhome`

Goto http://localhost:3000 to visit your new homepage :)

It is recommeneded to put this also behind NPM of course