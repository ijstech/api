const Path = require('path');
const PathRegexp = require('path-to-regexp');
const Request = require('./request');
const Fs = require('fs').promises;
// const VM = require('./vm');
const VM = require('@ijstech/vm');
const Log = require('@ijstech/log');
const RootPath = process.cwd();
const Sites = require('@ijstech/site');
const Module = require('@ijstech/module');

function clone(obj){
    if (obj)
        return JSON.parse(JSON.stringify(obj))
    else
        return {}
}
function parseUrl(regex, url){		
    if (url.toLowerCase() == regex.toLowerCase()){
        return {
            url: url,
            params: {}
        }
    }
    let keys = []
    let m;
    try{			
        let regexp = PathRegexp.pathToRegexp(regex, keys);			
        m = regexp.exec(url);
    }
    catch(err){
        Log.error(err)
        return;
    }	
    if (m) {        
        let params = {};
        if (keys.length > 0) {            
            let values = m.slice(1);
            for (let k = keys.length - 1; k > -1; k--) {                
                params[keys[k].name] = values[k]
            }
        } 
        let result = {
            url: url,
            params : params || {}
        }        
        return result;
    }
}
function resolveFullPath(...paths){    
    let p = paths[0];    
    for (let i = 1; i < paths.length; i ++){
        if (Array.isArray(paths[i])){
            let result = [];
            for (let k = 0; k < paths[i].length; k ++){
                result.push(Path.join(p, paths[i][k]))
            }
            for (let k = 0; k < result.length; k++){
                if (result[k].indexOf(p) != 0)
                    return
            }
            return result;
        }
        else{
            let result = Path.join(p, paths[i]);
            if (result.indexOf(p) == 0)
                p = result
            else
                return
        }
    }
    return p;
}
function mergeArray(array1, array2){
    if (array2)
        return array1.concat(array2.filter((item) => array1.indexOf(item) < 0))
    else
        return array1
}
async function getEndpoint(ctx, site){       
    for (let p in site.package)
        await updateEndpoints(site, p);

    if (site.routes && site.routes[ctx.method]){        
        let root = site.routes.root || '';        
        let routes = site.routes[ctx.method];        
        if (routes){                        
            for (let v in routes){                
                let endpoint = parseUrl(root + v, ctx.path)
                if (endpoint){                      
                    let route = routes[v]                           
                    if (!route.id && route.file){
                        let file = route.file.toLowerCase();
                        if (site.modules[file])
                            route.id = site.modules[file].id
                    }                    
                    endpoint.site = site
                    endpoint.route = route;
                    
                    if (route._middleware == undefined){                        
                        let _middleware = route.middleware || [];
                        let package = route.package;
                        if (package.middleware){
                            _middleware = package.middleware['*'] || [];                    
                            if (package.middleware[ctx.method]){
                                if (package.middleware[ctx.method]['*'])
                                    _middleware = mergeArray(_middleware, package.middleware[ctx.method]['*'])
                                for (let m in package.middleware[ctx.method]){   
                                    if ((root + m).toLowerCase() == ctx.path.toLowerCase()){
                                        _middleware = mergeArray(_middleware, package.middleware[ctx.method][m]);
                                    }
                                    let regexp = PathRegexp.pathToRegexp(root + package.middleware[ctx.method][m]);			
                                    let match = regexp.exec(ctx.path);
                                    if (match)
                                        _middleware = mergeArray(_middleware, package.middleware[ctx.method][m])
                                }
                            }                        
                        }
                        route._middleware = _middleware;
                    }
                    
                    if (route._acl == undefined){
                        if (route.acl){
                            route._acl = route.acl;
                        }                            
                        else{
                            let _acl = {};
                            let package = route.package;
                            if (package.acl){
                                _acl = package.acl['*'] || {};                    
                                if (package.acl[ctx.method]){
                                    if (package.acl[ctx.method]['*'])
                                        _acl = package.acl[ctx.method]['*']
                                    for (let m in package.acl[ctx.method]){   
                                        if ((root + m).toLowerCase() == ctx.path.toLowerCase()){
                                            _acl = package.acl[ctx.method][m];
                                            break;
                                        }
                                        let regexp = PathRegexp.pathToRegexp(root + package.acl[ctx.method][m]);			
                                        let match = regexp.exec(ctx.path);
                                        if (match){
                                            _acl = package.acl[ctx.method][m]
                                            break;
                                        }
                                    }
                                }                        
                            }
                            route._acl = _acl;
                        }                        
                    }
                    endpoint.acl = route._acl;
                    endpoint.middleware = route._middleware;
                    endpoint.require = [].concat(site.routes.require || [], routes.require || [], route.require || []);                    
                    if (typeof(ctx.query) == 'object'){
                        for (let q in ctx.query)
                            endpoint.params[q] = ctx.query[q]
                    }
                    if (route.package.liveUpdate){
                        try{                            
                            let module = await Module.getModuleScript(route.package, route)                                                    
                            route.script = module.script;
                            return endpoint
                        }
                        catch(err){
                            Log.error(err);
                        }                        
                    }
                    else
                        return endpoint;
                }
            }
        }        
    }
}
function getLocalPackage(name){
    let package;
    let path;
    try{
        package = require(name)
        path = Path.dirname(require.resolve(name + '/package.json'));
    }
    catch(err){
        try{
            package = require(RootPath + '/node_modules/' + name)
            path = Path.dirname(require.resolve(RootPath + '/node_modules/' + name + '/package.json'))
        }
        catch(err){
            Log.error('$package_not_found', {
                name: name
            })
            return;
        }
    }
    return {
        rootPath: path,
        default: package,
        plugin: package._plugin,
        middleware: package._middleware
    }
}
async function loadPlugins(vm, ctx, plugins, site, config){    
    let result = '';      
    if (Array.isArray(plugins)){
        for (let i = 0; i < plugins.length; i++){            
            let name = plugins[i];
            let pack = getLocalPackage(name);
            if (pack){
                let pluginConfig = Object.assign((site.plugin && site.plugin[name])?site.plugin[name]:{}, config[name] || {});
                let func = pack.plugin || pack.default
                if (typeof(func) == 'function'){                
                    func(vm, ctx, site, pluginConfig)
                }
            }
        }
    }    
    return result;
}
async function execute(ctx, site, endpoint, config){    
    let route = endpoint.route;    
    ctx.package = route.package;
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
                }
            }
            else
                route.script = await Fs.readFile(route.scriptPath, 'utf8');
        }
        
        if (route.script){
            require('./vmResponse')(vm, ctx, site);        
            require('./vmRequest')(vm, ctx, site);                    
            require('./vmSession')(vm, ctx, site);
            vm.injectGlobalObject('_params', endpoint.params);
            loadPlugins(vm, ctx, endpoint.require, site, config.plugin || {})            
            vm.injectScript(route.script)         
            await vm.eval(`
            (async function _untrusted() {
                var result = await handleRequest(_session, _request, _response, _params)
            })`)
            return true;
        }
    }
    catch(err){        
        Log.error(err, {
            hostname: ctx.hostname, 
            url: ctx.url
        })
        ctx.status = 503;
    }
    finally {
        vm.destroy();
    }
}
async function getRemoteFile(config, packageId, options){
    let result = await Request.post(config.host, {
        path: packageId,
        token: config.token,
        code: options?options.code:false,
        script: options?options.script:false
    });    
    try{
        if (typeof(result) == 'string')
            return JSON.parse(result)
        else   
            return result
    }
    catch(err){
        return;
    }
}
async function updateEndpoints(site, packname){        
    site.package = site.package || {};
    site.routes = site.routes || {};        
    let package = site.package[packname];       
    
    if (!package || package.liveUpdate || !package.loaded){                
        let pack;
        let packPath;
        if (package.liveUpdate){
            pack = await Module.getPackage(packname, package);    
            if (pack){
                site.package[packname] = site.package[packname] || {
                    liveUpdate : true
                }                
                for (let m in pack.routes){                                        
                    if (typeof(pack.routes[m]) == 'string' || Array.isArray(pack.routes[m])){
                        site.routes[m] = pack.routes[m];
                    }
                    else{
                        site.routes[m] = site.routes[m] || {}
                        for (let r in pack.routes[m]){
                            let route = JSON.parse(JSON.stringify(pack.routes[m][r]));                        
                            // route.liveUpdate = true;
                            site.routes[m][r] = route
                        }
                    }
                }
                site.modules = site.modules || {}
                for (let m in pack.modules){
                    site.modules[m.toLowerCase()] = pack.modules[m]
                }
            }            
        }
        else {
            pack = getLocalPackage(packname);    
            if (pack){
                packPath = pack.rootPath;            
                if (pack.default){                     
                    pack = pack.default;       
                    
                    site.package[packname] = site.package[packname] || {}
                    site.package[packname].loaded = true;
                }
            }
        }        
        if (pack){            
            let packInfo = {
                acl: clone(pack.acl),
                id: package.id,
                liveUpdate: package.liveUpdate,
                name: packname,
                // middleware: clone(pack.middleware),                
                db: clone(package.db || site.db || [])
            }        
            if (Array.isArray(pack.require)){
                for (let i = 0; i < pack.require.length; i ++)
                    await updateEndpoints(site, pack.require[i]);
            } 
            for (let m in pack.routes){                                        
                if (typeof(pack.routes[m]) == 'string' || Array.isArray(pack.routes[m])){                
                    site.routes[m] = pack.routes[m];
                }
                else{
                    site.routes[m] = site.routes[m] || {}
                    for (let r in pack.routes[m]){
                        let route = clone(pack.routes[m][r]);
                        route.package = packInfo;
                        if (!package.liveUpdate)
                            route.scriptPath = resolveFullPath(packPath, route.scriptPath);                            
                            
                        site.routes[m][r] = route
                    }
                }
            }
            site.modules = site.modules || {}
            for (let m in pack.modules){
                site.modules[m.toLowerCase()] = pack.modules[m]
            }
        }        
    }
}
async function _middleware(ctx, next, options){
    try{
        let site = Sites.getSite(ctx.hostname);//sites[ctx.hostname.toLowerCase()]; 
        if (site){       
            if (site.cors){                
                if (site.cors.origin){
                    if (site.cors.origin == '*')
                        ctx.set('Access-Control-Allow-Origin', ctx.get('Origin'))
                    else
                        ctx.set('Access-Control-Allow-Origin', site.cors.origin)
                }
                if (ctx.method == 'OPTIONS'){
                    if (site.cors.allowCredentials)
                        ctx.set('Access-Control-Allow-Credentials', 'true')
                    if (ctx.get('Access-Control-Request-Headers'))
                        ctx.set('Access-Control-Allow-Headers', site.cors.allowHeaders || ctx.get('Access-Control-Request-Headers'))
                    ctx.status = 200
                    return;
                }
            } 
            ctx.site = site;            
            for (let middleware in site.middleware){
                let pack = getLocalPackage(middleware);
                if (pack){
                    let func = pack.middleware || pack.default;
                    if (func)
                        func = func(site.middleware[middleware] || {});
                    if (typeof(func) == 'function'){
                        let middleNext = false;
                        await func(ctx, function(){                                    
                            middleNext = true;
                        });                            
                        if (!middleNext)
                            return;
                    }
                }                    
            };
            let endpoint = await getEndpoint(ctx, site);
            if (endpoint){
                if (!endpoint.acl.public && ctx.session && !ctx.session.account){
                    ctx.status = 401;
                    return;
                }
                if (endpoint.route.multipart) {
                    const koaBody = require('koa-body')({
                        multipart: true, 
                        uploadDir: '.'                              
                    });                            			    
                    await koaBody(ctx, () => {});
                }  
                if (endpoint.route.params)                    
                    Object.assign(endpoint.params, endpoint.route.params);
                let result = await execute(ctx, site, endpoint, {});//, config);                    
                if (!result)
                    ctx.body = '$exception';
            }
            else
                await next();
        }
        else
            await next();
    }
    catch(err){            
        Log.error(err)
        ctx.body = '$exception';
    }
}
module.exports = {
    _init: function(options){
        this.options = options;        
    },
    _middleware: function(ctx, next){
        return _middleware(ctx, next, this.options);
    }
};