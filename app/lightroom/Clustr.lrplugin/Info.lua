-- Clustr Collections: Lightroom Classic plug-in.
-- Creates collection sets and collections from clustr-manifest.json, which
-- Clustr writes into every export folder. Install once via File > Plug-in
-- Manager > Add, then use Library > Plug-in Extras > "Create collections from
-- Clustr export...".
return {
    LrSdkVersion = 10.0,
    LrSdkMinimumVersion = 6.0,
    LrToolkitIdentifier = 'com.clustr.collections',
    LrPluginName = 'Clustr Collections',
    LrLibraryMenuItems = {
        {
            title = 'Create collections from Clustr export...',
            file = 'ImportCollections.lua'
        }
    },
    VERSION = { major = 1, minor = 0, revision = 0 }
}
