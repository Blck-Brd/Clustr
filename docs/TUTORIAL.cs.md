# Clustr – návod (čeština)

Clustr je lokální organizér fotek. Seskupuje fotky do složek podle času, místa a hustotních heatmap a následně exportuje strom složek s Adobe Lightroom XMP sidecary. AI názvy událostí a vizuální tagy jsou volitelné.

## 1. Načtení fotek

1. Klikněte na **Nahrát složku** a vyberte složku s fotkami.
2. Clustr podporuje JPG, PNG, WebP, HEIC/HEIF, NEF, CR2, ARW, DNG, RAF, ORF a TIFF.
3. Náhledy se načítají na pozadí:
   - Pokud má RAW/HEIC vedle sebe stejnojmenné JPG, použije se JPG okamžitě.
   - Jinak Clustr přečte zabudovaný náhled nebo převede HEIC ve workeru.
   - Dlaždice s **Bez náhledu** nemá extrahovatelný náhled; fotka se ale normálně exportuje.

S prací můžete začít i během načítání náhledů. Fáze už nepřepisují již hotové náhledy.

## 2. Import Timeline (volitelné)

Klikněte na **Timeline JSON** a vyberte export z Google Timeline. Clustr podle času fotky najde návštěvy, aktivity a trasy a přiřadí lokaci, pokud fotka nemá GPS.

## 3. Fáze 1 – EXIF metadata

Klikněte na **Načíst EXIF**. Clustr přečte datum pořízení, fotoaparát, GPS a lokaci a přidá automatické tagy ročního období a denní doby.

Pod **ozubeným kolem** u fáze 1 nastavte **Kde je domov?**. Pomůže oddělit domácí focení od skutečných výletů.

## 4. Fáze 2 – Clustering a heatmapy

Toto je hlavní třídění. Máte dva režimy:

- **Heatmap clustering** – připraví fotky a otevře spodní heatmapu v režimu kreslení. Nakreslete rozsah nebo zadejte Start/Konec a vytvořte složku z vybraných fotek.
- **Auto clustering** – automaticky vytvoří cesty, zastávky, domácí sezení, Random a Screenshot-Clutter.

Nastavení fáze 2 (profil, citlivost cest/zastávek, okruh domova, mezery sezení, minimum pro Random) je pod **ozubeným kolem**.

### Strom složek a drobečková navigace

Levý **Strom složek** filtruje galerii. Kliknutím na složku zobrazíte její obsah včetně podsložek.

Nad dlaždicemi fotek vždy uvidíte:

- **Všechny fotky**, když není nic filtrované.
- Jeden řádek pro každou vybranou složku ve formátu `Rodič → Potomek → Zastávka`, například `Trip 1 → Stop 2 - Turnov`.
- Více řádků, když je vybraných více složek.

Filtr složky zrušíte křížkem **×** na řádku.

### Přidání dalšího clusteru do existující složky

1. V heatmapě vyberte nebo nakreslete druhý cluster.
2. V části **Přidat do existující složky** vyberte cílovou složku. Výběr zobrazuje hierarchii s odsazením.
3. Klikněte na **Přidat**.

Vybrané fotky se přidají do složky a převezmou její lokaci. Hodí se to, když máte 30 fotek z Turnova, dva týdny Chorvatska a potom 90 dalších turnovských fotek, které patří do stejné složky.

### Názvy složek

Název v poli **Nová složka z výběru** je jeden název složky. Text `Něco xx/yy` vytvoří jednu složku `Něco xx - yy`; nevytvoří podsložky.

## 5. Fáze 3 – Názvy událostí (volitelné)

Pod **ozubeným kolem** zvolte:

- zda se názvy mají použít na cesty, nebo na zastávky/podsložky,
- model Ollama nebo Gemini,
- vlastní název modelu a Gemini API klíč.

Kliknutím na **Pojmenovat události** nahradíte dočasné názvy. Ručně pojmenované události AI nepřepíše.

## 6. Fáze 4 – Vizuální tagy (volitelné)

Pod **ozubeným kolem** zvolte vision model (Moondream, Llama Vision nebo vlastní Ollama model) a klikněte na **Vizuální tagy**. Clustr popíše fotku a převede popis na klíčová slova.

## 7. Fáze 5 – Doplňování dat (volitelné)

Klikněte na **Doplnit lokace**. Clustr ukazuje postupně fotky, kterým chybí lokace.

- Napište místo a stiskněte **Enter** nebo klikněte na **Použít**.
- Lokace se použije na fotku a na blízké fotky bez lokace.
- Pod **ozubeným kolem** změňte časové okno blízkých fotek (výchozí 12 hodin).
- **Přeskočit** fotku nechá beze změny; **Esc** fázi zavře.

## 8. Kontrola a export

- **Tinder** – ponechte nebo zahoďte fotky šipkami vlevo/vpravo.
- Strom složek – přejmenování, zabalení, rozdělení a hromadné úpravy událostí a lokací.
- **Export** – vyberte cílovou složku a potvrďte. Dialog ukazuje aktuální fotku a ukazatel průběhu.
- Clustr uloží fotky a vedle každé soubor `.xmp`, který Lightroom umí přečíst.

### Metadata pro Lightroom

Každý XMP sidecar obsahuje:

- `dc:subject` – plochá klíčová slova (tagy, název události, lokace).
- `lr:hierarchicalSubject` – cestu události jako hierarchii Lightroomu, například `Trip 1|Stop 2 - Turnov`.
- `photoshop:City` – lokaci.
- `Iptc4xmpCore:Location` – stejnou lokaci v poli Location v Lightroomu.

## Tipy

- Dokončené fáze mají zelenou fajfku. Volitelné fáze jsou označené `(volitelné)`.
- Nastavení zůstává schované pod ozubeným kolem, takže postranní panel zůstává kompaktní.
- Velké složky RAW se při prvním načtení zpracovávají déle, protože se čtou náhledy a EXIF. Stejnojmenná JPG vše výrazně zrychlí.
- Clustr je local-first: fotky, metadata i Timeline zůstávají v prohlížeči (IndexedDB). Ollama a Nominatim jsou volitelné síťové služby.
- Po aktualizaci jednou tvrdě obnovte stránku (Ctrl+Shift+R), aby se použil nový service worker i preview worker.

## Řešení potíží

- **RAW dlaždice hlásí Bez náhledu** – soubor nemá zabudovaný náhled ani stejnojmenné JPG. Export funguje dál.
- **Náhled zůstává dlouho na „Načítám náhled…“** – obnovte stránku a zkontrolujte aktualizaci service workeru (viz výše).
- **Ollama neodpovídá** – spusťte Ollama lokálně, nastavte `OLLAMA_ORIGINS=*` a restartujte ji. AI fáze jsou volitelné.
- **Export není dostupný** – použijte prohlížeč na bázi Chromia; export používá File System Access API.
