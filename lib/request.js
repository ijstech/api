const https = require('https');
const http = require('http');
const Url = require('url');

function post(url, data, headers){
    return new Promise(function(resolve, reject){        
        url = Url.parse(url);
        headers = headers || {};
        if (typeof(data) != 'undefined'){
            if (typeof(data) != 'string'){
                data = JSON.stringify(data);
                if (!headers['Content-Type'])
                    headers['Content-Type'] = 'application/json';
            }
            headers['Content-Length'] = data.length;
        }                
        const options = {
            hostname: url.hostname,
            path: url.path,
            method: 'POST',
            headers: headers
        };
        
        function callback(res){
            let data = '';
            let contentType = res.headers['content-type'];            
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', ()=>{
                if (contentType && contentType.indexOf('json'))                
                    resolve(JSON.parse(data))
                else
                    resolve(data)
            })
        }
        let req;
        if (url.protocol == 'https')
            req = https.request(options, callback)
        else
            req = http.request(options, callback);
        
        req.on('error', (err)=>{            
            reject(err);
        })
        req.write(data || '');
        req.end();
    })
}
module.exports = {
    post: post
}