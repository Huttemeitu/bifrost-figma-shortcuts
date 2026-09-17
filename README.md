# Bifrost Fill/Padding/Gap/Radius/Text-shortcuts for Figma

Kort fortalt: en Figma-plugin som binder Bifrost-designtokens (farger,
spacing, radius, tekststiler) til valgte objekter via egne menykommandoer —
som igjen kan bindes til vanlige macOS-tastatursnarveier (og dermed en
Stream Deck, siden den bare sender tastetrykk).

Pluginen dekker i dag 919 menykommandoer: 814 fyll-farger, 12
padding-variabler, 12 gap-variabler, 7 radius-variabler, 68 tekststiler, samt
5 "Søk - ..."-kommandoer (én per kategori, for å slippe å bla i en lang
snarveisliste) og én "List variabler (JSON)"-kommando for debugging.

## Filene

| Fil | Hva den er |
|---|---|
| `manifest.json` | Figma-pluginens manifest — definerer alle menykommandoene |
| `code.js` | Selve plugin-logikken (kjøres direkte av Figma, ingen byggesteg) |
| `bifrost-variables.json` | Rå eksport av Bifrost-variabler (farger, spacing, radius) fra Figma |
| `bifrost-text-styles.json` | Rå eksport av Bifrost-tekststiler fra Figma |
| `generate.js` | Genererer `manifest.json` + `code.js` fra de to JSON-filene over |
| `gen-scripts.js` | Genererer `setup-shortcut-placeholders.sh` + `undo-shortcuts.sh` fra `manifest.json` |
| `setup-shortcut-placeholders.sh` | Legger til alle menykommandoene som tomme rader i macOS Systeminnstillinger, klare til å bindes |
| `undo-shortcuts.sh` | Sletter valgte rader permanent (alt aktivt/ikke kommentert ut som default — se advarsel under) |

## Steg 1 — Sjekk om du kan bruke filene som de er

Hvis du har tilgang til **samme publiserte Bifrost-bibliotek** i Figma
(sannsynlig, siden det er et internt design-system), kan du sannsynligvis
bruke `manifest.json` og `code.js` **helt uendret** — variablene er
identifisert med en global `key` som er den samme uansett hvilken fil eller
person som bruker dem. Du trenger da ikke kjøre `generate.js` på nytt.

Kjør bare Steg 2 og se om det fungerer. Regenerer først (Steg 4) hvis det
ikke gjør det, eller hvis du vil legge til/fjerne variabler.

## Steg 2 — Registrer pluginen i Figma

1. Figma desktop-appen → **Plugins → Development → New Plugin...**
2. Velg en vilkårlig mal, lagre i en egen mappe lokalt.
3. Overskriv de to genererte filene (`manifest.json`, `code.js`) i den mappen
   med filene her.
4. Kjør pluginen én gang fra **Plugins → Development** i en fil hvor
   Bifrost-biblioteket er tilgjengelig, for å bekrefte at variablene
   faktisk løses opp (test med en av `Fyll - ...`-kommandoene på et valgt
   objekt).

## Steg 3 — Bind tastatursnarveier

1. Bekreft Figmas bundle-id (skal normalt være det samme for alle, men
   sjekk selv):
   ```bash
   osascript -e 'id of app "Figma"'
   ```
   Hvis den avviker fra `com.figma.Desktop`, endre `BUNDLE_ID`-variabelen
   øverst i begge `.sh`-filene (og i `gen-scripts.js` om du regenererer dem).
2. **Lukk Systeminnstillinger helt** (Cmd+Q) — dette er kritisk, se
   "Viktige fallgruver" under.
3. Kjør:
   ```bash
   chmod +x setup-shortcut-placeholders.sh
   bash setup-shortcut-placeholders.sh
   ```
4. Åpne **Systeminnstillinger → Tastatur → Tastatursnarveier → Programsnarveier → Figma**.
   Du skal se én rad per menykommando, med tom tastekombinasjon.
5. Dobbeltklikk raden du vil sette en snarvei for, trykk ønsket
   tastekombinasjon.

## Steg 4 — Regenerer hvis Bifrost-biblioteket endrer seg (eller du bruker et annet bibliotek)

1. Åpne filen der variablene/tekststilene faktisk ligger.
2. Kjør pluginens `List variabler (JSON)`-kommando, eller lim inn dette i
   plugin-konsollen (**Plugins → Development → Open Console**):
   ```js
   (async () => {
     const collections = await figma.variables.getLocalVariableCollectionsAsync();
     const result = [];
     for (const c of collections) {
       for (const id of c.variableIds) {
         const v = await figma.variables.getVariableByIdAsync(id);
         if (!v) continue;
         result.push({ collection: c.name, name: v.name, id: v.id, key: v.key, resolvedType: v.resolvedType });
       }
     }
     console.log(JSON.stringify(result, null, 2));
   })();
   ```
   Høyreklikk loggen → **Copy string contents** → lagre som `bifrost-variables.json`.
3. For tekststiler (Text Styles, ikke variabler), lim inn i stedet:
   ```js
   (async () => {
     const styles = await figma.getLocalTextStylesAsync();
     const result = styles.map((s) => ({
       name: s.name, id: s.id, key: s.key,
       fontSize: s.fontSize, fontFamily: s.fontName.family, fontStyle: s.fontName.style,
       lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
     }));
     console.log(JSON.stringify(result, null, 2));
   })();
   ```
   Lagre som `bifrost-text-styles.json`.
4. Kjør (Node.js må være installert, ingen andre avhengigheter trengs):
   ```bash
   node generate.js bifrost-variables.json . bifrost-text-styles.json
   node gen-scripts.js manifest.json .
   ```
   `bifrost-text-styles.json` er valgfritt — utelat siste argument om du ikke har det.
5. Kjør pluginen én gang i Figma for å bekrefte at den nye `code.js` fungerer,
   og kjør `setup-shortcut-placeholders.sh` på nytt (Steg 3.2–3.3) for å legge
   til plassholdere for eventuelle nye kommandoer.

## Viktige fallgruver (lært på den harde måten)

- **Lukk alltid Systeminnstillinger helt før du kjører `setup-shortcut-placeholders.sh` eller `undo-shortcuts.sh`.**
  Har den vært åpen, cacher den en gammel tilstand og skriver den tilbake
  til disk når den lukkes — og overskriver det scriptet nettopp gjorde.
- **Menynavn kan ikke inneholde `:`** — det er PlistBuddys eget
  sti-skilletegn, og ser også ut til å forstyrre macOS' egen
  snarveis-matching. `generate.js` bruker `" - "` i stedet.
- **Ikke prøv å "unassigne" en snarvei tilbake til tom via UI** (dobbeltklikk
  + Delete) — det fungerer ikke pålitelig. Bruk `undo-shortcuts.sh` (sletter
  raden helt) + kjør `setup-shortcut-placeholders.sh` på nytt (legger den
  tilbake tom) i stedet.
- `undo-shortcuts.sh` sletter **alle** rader i lista den bærer på, med mindre
  du kommenterer ut linjene du vil beholde med `#` først — den er ikke
  reversibel utover backupen den tar.
- Begge `.sh`-scriptene tar automatisk en full backup av Figmas preferences
  først (`~/figma-shortcuts-backup-<timestamp>.plist`) — bruk
  `defaults import com.figma.Desktop <backup-fil>` for å rulle tilbake om
  noe går galt.
