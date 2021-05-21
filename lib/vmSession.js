module.exports = function(vm, ctx, site){        
    vm.injectGlobalObject('_$$plugin_session', {        
        getMenus: function(){            
            return JSON.stringify(site.menus);
        },
        getModules: function(){            
            return JSON.stringify(site.modules);
        }
	}, '' + function init() {
		global._session = {
            site: {
                get menus(){                 
                    try{
                        return JSON.parse(_$$plugin_session.getMenus());
                    }
                    catch(err){}                                        
                },
                get modules(){
                    try{
                        return JSON.parse(_$$plugin_session.getModules());
                    }
                    catch(err){}
                }
            }
        }
	} + ';init()')
}