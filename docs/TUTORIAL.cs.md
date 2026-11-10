# Clustr – Uživatelská příručka

Klidný způsob, jak roztřídit velkou fotogalerii do složek, které dávají smysl. Clustr seskupuje fotky podle času, místa a hustotních heatmap a potom exportuje strom složek s metadaty, kterým rozumí Lightroom. AI názvy a vizuální tagy jsou volitelné; samotné třídění je lokální a jde kdykoli upravit ručně.

---

## 1. Začínáme

1. Otevřete aplikaci a klikněte na **Nahrát složku**. Vyberte složku s fotkami.
2. Clustr čte fotky přímo v prohlížeči. Účet nepotřebujete.
3. Pokud chcete lokace z Google Timeline, klikněte na **Timeline JSON** a importujte export. Je to volitelné.
4. **Otazník** kdykoli otevře tuto příručku přímo v aplikaci.

Při prvním nahrání složky Clustr ukáže krátkou prohlídku s reflektorem na jednotlivé části obrazovky. Můžete ji kdykoli přeskočit. Znovu ji spustíte přes **otazník** a tlačítko **Spustit prohlídku**.

Můžete pracovat i během načítání náhledů a metadat. Postranní panel ukazuje u každé fáze fajfku, když je hotová. Nastavení zůstává schované pod **ozubeným kolem** vedle názvu fáze, takže panel zůstává přehledný.

---

## 2. Fotky a náhledy

Clustr přijímá JPG, PNG, WebP, HEIC/HEIF, NEF, CR2, ARW, DNG, RAF, ORF a TIFF.

- Pokud má RAW nebo HEIC vedle sebe stejnojmenné JPG, použije se JPG jako náhled okamžitě.
- Jinak Clustr přečte náhled uložený v souboru, nebo HEIC převede na pozadí.
- Dlaždice s **Bez náhledu** nemá čitelný náhled. Fotka se ale normálně zatřídí i exportuje.

Při prvním načtení velké složky RAW může vše chvíli trvat, protože se každý soubor čte z disku. Stejnojmenná JPG vše výrazně zrychlí.

---

## 3. Fáze 1 – EXIF metadata

Klikněte na **Načíst EXIF**. Clustr přečte datum pořízení, fotoaparát, GPS a lokaci a přidá jemné automatické tagy, například roční období a denní dobu.

Pod **ozubeným kolem** nastavte **Kde je domov?**. Pomůže to odlišit domácí focení od skutečného výletu.

---

## 4. Fáze 2 – Clustering a heatmapy

Toto je hlavní třídění. Můžete ho použít dvěma způsoby:

- **Heatmap clustering** – připraví fotky a otevře spodní heatmapu v režimu kreslení. Nakreslete rozsah datumů nebo zadejte Start/Konec a vytvořte složku z vybraných fotek.
- **Auto clustering** – automaticky vytvoří cesty, zastávky, domácí sezení, Random a Screenshot-Clutter.

Pod **ozubeným kolem** doladíte profil, citlivost cest a zastávek, okruh domova, mezery sezení a minimum pro Random.

### Strom složek

**Strom složek** vlevo filtruje galerii. Kliknutím na složku zobrazíte její obsah včetně všech podsložek. Druhým kliknutím filtr zrušíte.

Nad dlaždicemi fotek vám drobečková navigace vždy ukáže, na co se díváte:

- **Všechny fotky**, když není nic filtrované.
- Jeden řádek pro každou vybranou složku, například `Trip 1 → Stop 2 - Turnov`.
- Více řádků, když je vybraných více složek.

Křížkem **×** na řádku zrušíte filtr dané složky.

### Přidání dalšího clusteru do existující složky

1. V heatmapě vyberte nebo nakreslete další cluster.
2. V části **Přidat do existující složky** vyberte cílovou složku. Výběr zobrazuje hierarchii s odsazením.
3. Klikněte na **Přidat**.

Vybrané fotky se přidají do složky a převezmou její lokaci. Tohle je rychlý způsob, jak dostat 30 fotek z Turnova, dva týdny Chorvatska a dalších 90 turnovských fotek do stejné složky Turnov.

### Název nové složky

Pole **Nová složka z výběru** znamená jeden název složky. Text `Něco xx/yy` vytvoří jednu složku `Něco xx - yy`; nevytvoří podsložky.

---

## 5. Fáze 3 – Názvy událostí (volitelné)

Pod **ozubeným kolem** zvolte, zda se názvy mají použít na cesty, nebo na zastávky, a který model Ollama nebo Gemini se má použít. Tamtéž zadáte vlastní název modelu a Gemini API klíč.

Kliknutím na **Pojmenovat události** nahradíte dočasné názvy. Události, které jste pojmenovali sami, jsou chráněné a AI je nepřepíše.

---

## 6. Fáze 4 – Vizuální tagy (volitelné)

Pod **ozubeným kolem** zvolte vision model a klikněte na **Vizuální tagy**. Clustr popíše každou fotku a převede popis na několik užitečných klíčových slov.

Tato fáze potřebuje Ollama spuštěnou na vašem počítači. Pokud tagy nepotřebujete, klidně ji přeskočte.

---

## 7. Fáze 5 – Doplňování dat (volitelné)

Klikněte na **Doplnit lokace**. Clustr vám postupně ukáže fotky, kterým chybí lokace.

- Napište místo a stiskněte **Enter**, nebo klikněte na **Použít**.
- Místo se použije na fotku a na blízké fotky bez lokace.
- **Přeskočit** fotku nechá beze změny.
- **Esc** fázi zavře.
- Pod **ozubeným kolem** nastavíte, kolik hodin se počítá jako „blízké“ (výchozí 12 hodin).

---

## 8. Kontrola a úpravy

- **Tinder** – ponechte nebo zahoďte fotky šipkami vlevo a vpravo.
- **Strom složek** – přejmenujte složky, zabalte události do nadřazené složky, rozdělte složku nebo upravte více fotek najednou.
- **Heatmapa** – filtrujte po dnech, nakreslete další cluster, přejmenujte clustery nebo přidejte fotky do existující složky.
- **Hromadná úprava** – vyberte fotky a změňte jim událost, lokaci nebo tagy společně.

Hotové fáze mají zelenou fajfku. Fáze 3, 4 a 5 jsou volitelné a jsou tak i označené.

---

## 9. Export

Klikněte na **Export**, vyberte cílovou složku a potvrďte. Okno s průběhem ukazuje aktuální fotku, počet zapsaných fotek a ukazatel průběhu.

Clustr uloží fotky do stromu složek a vedle každé přidá soubor `.xmp`, který Lightroom umí přečíst. Sidecar obsahuje:

- **Klíčová slova** – vaše tagy, název události a lokaci.
- **Hierarchii složek** – cestu události, například `Trip 1|Stop 2 - Turnov`.
- **Lokaci** – název místa v polích City a Location v Lightroomu.

Pro export použijte prohlížeč na bázi Chromia; využívá přístup k systémovým složkám.

---

## 10. Vaše data, lidsky

Clustr je local-first. Fotky, metadata i Timeline zůstávají ve vašem prohlížeči (IndexedDB). Fotky se nikam nenahrávají a nic z toho není uložené v repozitáři.

AI názvy a vizuální tagy jsou volitelné. Ollama běží na vašem počítači. Pokud zvolíte Gemini, odesílají se Googlu jen textové souhrny s vaším API klíčem. Zpětné geokódování GPS souřadnic používá OpenStreetMap Nominatim. Pokud tyto funkce nepoužíváte, Clustr zůstává celý na vašem zařízení.

---

## 11. Řešení potíží

### Náhledy

- **RAW dlaždice hlásí Bez náhledu** – soubor nemá uložený náhled ani stejnojmenné JPG. Export funguje dál.
- **Náhled zůstává dlouho na „Načítám náhled…“** – obnovte stránku. Velké složky RAW jsou při prvním načtení prostě pomalé.
- **Náhledy vypadají po aktualizaci staře** – tvrdě obnovte stránku (Ctrl+Shift+R) nebo zavřete a znovu otevřete nainstalovanou aplikaci.

### Třídění

- **Výlet se rozdělil do více složek** – otevřete ozubené kolo u fáze 2 a zvětšete mezeru cest nebo snižte citlivost.
- **Chybí zastávky** – pro ty dny možná není Timeline ani GPS. Importujte Timeline pokrývající data fotek a spusťte fázi 2 znovu.
- **Druhý cluster má patřit do existující složky** – v heatmapě použijte **Přidat do existující složky**, nevytvářejte novou.

### Export

- **Export není dostupný** – použijte prohlížeč na bázi Chromia.
- **Lightroom nevidí tagy** – naimportujte `.xmp` sidecary nebo zkontrolujte, že Lightroom čte sidecary u RAW fotek.
- **Export se zastavil** – zkontrolujte, že cílová složka existuje a má dost místa, a spusťte export znovu.

### Ollama a Gemini

- **Ollama neodpovídá** – spusťte Ollama, nastavte `OLLAMA_ORIGINS=*` a restartujte ji. AI fáze jsou volitelné.
- **Model chybí** – nejdřív ho stáhněte, například `ollama pull llama3.2`.
- **Gemini hlásí neplatný klíč** – vložte klíč znovu pod ozubeným kolem fáze 3 a zkontrolujte, že vybraný model je dostupný pro váš účet.

---

## 12. Stále vám to nejde?

Otevřete issue na **https://github.com/Blck-Brd/Clustr/issues** a napište, co vidíte a co jste čekali. Pomůže screenshot. Pokud zlobí konkrétní fotka, uveďte její formát (NEF, HEIC, JPG) a jestli má vedle sebe stejnojmenné JPG.

Děkujeme, že třídíte s Clustrem.
