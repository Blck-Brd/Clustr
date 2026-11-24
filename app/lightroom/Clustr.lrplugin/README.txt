Clustr -> Lightroom Classic collections

1. Lightroom Classic: File > Plug-in Manager > Add...
2. Pick the Clustr.lrplugin folder that sits next to this readme.
3. Import the photo folders from this export as usual.
4. Library > Plug-in Extras > "Create collections from Clustr export..."
   and choose clustr-manifest.json in the export root.

Re-running step 4 is safe: collection sets and collections are reused,
missing photos are added and photos already in a collection are skipped.
The plug-in matches photos by file name plus relative path, so it works
for raw files and JPEG exports alike.

Clustr -> kolekce v Lightroomu Classic
1. Lightroom Classic: Soubor > Správce doplňků > Přidat...
2. Vyberte složku Clustr.lrplugin vedle tohoto souboru.
3. Naimportujte složky s fotkami z tohoto exportu.
4. Knihovna > Doplňky > "Create collections from Clustr export..."
   a vyberte clustr-manifest.json v kořeni exportu.
Krok 4 můžete klidně spustit znovu: sady a kolekce se využijí,
chybějící fotky se doplní a existující se přeskočí.
