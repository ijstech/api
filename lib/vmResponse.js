module.exports = function(vm, ctx, site){
    let obj = {        
        cookie: function(name, value, option){
            ctx.cookies.set(name, value, option)
        },        
        end: function(value){            
            if (!ctx.type && typeof(value) == 'string' && value.substr(0,5) == 'data:'){
                let data = value.split(',');
                if (data.length == 2 && data[0].slice(-7) == ';base64'){
                    let buffer = Buffer.from(data[1], 'base64');
                    ctx.set('Content-Length', buffer.length);
                    ctx.type = data[0].substr(5, data[0].length - 12);
                    ctx.body = buffer;
                }
                else
                    ctx.body = value;
            }
            else
                ctx.body = value;           
        },
        header: function(name, value){
            ctx.set(name, value);
        }
    }
    vm.injectGlobalObject('_$$plugin_response', obj, ''+ function init(){
    	global._response = {
    		cookie: function(name, value, option){
                _$$plugin_response.cookie(name, value, option);
            },
            end: function(value){                
                if (typeof(value.toJSON) == 'function')
                    _$$plugin_response.end(value.toJSON())
                else
                    _$$plugin_response.end(value)
            },
            header: function(name, value){
                _$$plugin_response.set(name, value)
            }
    	}
    } + ';init()');      
}