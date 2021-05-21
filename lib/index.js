const Fs = require('fs').promises;
const VM = require('@ijstech/vm');
const Log = require('@ijstech/log');
const RootPath = process.cwd();
const Module = require('@ijstech/module');
const MultipartBody = require('koa-body')({
    multipart: true, 
    uploadDir: '.'                              
});
var Options = {};

async function loadPlugins(vm, ctx, plugins, site, config){
    let result = '';      
    if (Array.isArray(plugins)){
        for (let i = 0; i < plugins.length; i++){            
            let name = plugins[i];
            let pack = Module.getLocalPackage(name);
            if (pack){
                let pluginConfig = Object.assign((site.plugin && site.plugin[name])?site.plugin[name]:{}, config[name] || {});
                let func = pack.plugin || pack.default;
                if (typeof(func) == 'function'){                
                    func(vm, ctx, site, pluginConfig);
                };
            };
        };
    };
    return result;
};
async function execute(ctx, site, endpoint, config){    
    let route = endpoint.route;        
    //TODO: reuse the VM instance
    let vm = new VM({
        timeLimit: 15 * 60 * 1000, //15 minutes     
        logging: true
    }); 
    try{                
        if (route.script == undefined && route.scriptPath){
            if (Array.isArray(route.scriptPath)){
                route.script = '';
                for (let i = 0; i < route.scriptPath.length; i ++){
                    let s = await Fs.readFile(route.scriptPath[i], 'utf8');                    
                    route.script = route.script + '\n' + s;
                };
            }
            else
                route.script = await Fs.readFile(route.scriptPath, 'utf8');
        };        
        if (route.script){
            require('./vmResponse')(vm, ctx, site);        
            require('./vmRequest')(vm, ctx, site);                    
            require('./vmSession')(vm, ctx, site);
            vm.injectGlobalObject('_params', endpoint.params);
            loadPlugins(vm, ctx, endpoint.require, site, config.plugin || {});
            vm.injectScript(route.script);
            await vm.eval(`
            (async function main() {                
                var result = await handleRequest(_session, _request, _response, _params)
            })`);
            return true;
        };
    }
    catch(err){        
        Log.error(err, {
            hostname: ctx.hostname, 
            url: ctx.url
        });
        ctx.status = 503;
    }
    finally {
        vm.destroy();
    };
};
async function _handler(ctx, options){
    return new Promise(async function(resolve){
        let site = ctx.site;
        let endpoint = ctx.endpoint;    
        let needToHandle = false;
        if (endpoint && endpoint.route){
            let ext;
            if (endpoint.route.file)
                ext = endpoint.route.file.split('.').pop();                
            else if (endpoint.route.scriptPath && endpoint.route.scriptPath[0])
                ext = endpoint.route.scriptPath[0].split('.').pop();                
            if (ext && (ext == 'tsp' || ext == 'js'))
                needToHandle = true;
        }
        if (needToHandle){                    
            if (endpoint.route.multipart) {                   
                await MultipartBody(ctx, () => {});
            };
            if (endpoint.route.params)
                Object.assign(endpoint.params, endpoint.route.params);
            
            let result = await execute(ctx, site, endpoint, options);//, config);                    
            if (!result)
                ctx.body = '$exception';
            resolve(true)
        }
        else
            resolve(false);
    })    
};
module.exports = {
    _init: function(options){        
        Options = options;      
    },
    _handler: function(ctx){   
        return _handler(ctx, Options);
    }
};