module.exports = function(vm, ctx, site){
    let obj = {
        method: ctx.method,
        hostname: ctx.hostname || '',
        path: ctx.path || '',
        url: ctx.url || '',
        ip: ctx.ip || '',
        files: JSON.stringify(ctx.request.files),
        data: JSON.stringify(ctx.request.body || {}),
        cookie: function(name){
            return ctx.cookies.get(name);
        },
        header: function(name){            
            return ctx.get(name);
        }
    }
    vm.injectGlobalObject('_request', obj, `global._request.data = JSON.parse(global._request.data)`);
}