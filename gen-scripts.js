const fs = require("fs");
const path = require("path");

const manifestPath = process.argv[2];
const outDir = process.argv[3] || ".";

const PREFIXES = ["fill-", "pad-", "gap-", "radius-", "text-"];

const variables = JSON.parse(fs.readFileSync(manifestPath, "utf8")).menu.filter(
  (m) => m.command && PREFIXES.some((p) => m.command.startsWith(p))
);

const DELIM = "BIFROST_VAR_LIST_EOF";
const NBSP = String.fromCharCode(0xa0);
const names = variables.map((v) => v.name).join("\n");

const undoScript = `#!/bin/bash
# Fjerner KUN radene i lista under som IKKE er kommentert ut med #.
# Sett # foran en linje for å hoppe over den.
# Dekker Fyll/Padding/Gap/Radius/Text-menypunktene generert av generate.js.

BUNDLE_ID="com.figma.Desktop"
PLIST="$HOME/Library/Preferences/\${BUNDLE_ID}.plist"

BACKUP="$HOME/figma-shortcuts-backup-$(date +%s).plist"
defaults export "$BUNDLE_ID" "$BACKUP"
echo "Sikkerhetskopi lagret: $BACKUP"

osascript -e 'quit app "Figma"' 2>/dev/null || true
sleep 1
killall cfprefsd 2>/dev/null || true

count=0
skipped=0
fail=0
while IFS= read -r name; do
  [ -z "$name" ] && continue
  case "$name" in
    "#"*) skipped=$((skipped+1)); continue;;
  esac
  if /usr/libexec/PlistBuddy -c "Delete :NSUserKeyEquivalents:\\"$name\\"" "$PLIST" 2>/dev/null; then
    count=$((count+1))
  else
    fail=$((fail+1))
  fi
done << '${DELIM}'
${names}
${DELIM}

killall cfprefsd 2>/dev/null || true
echo "Fjernet: $count. Kommentert ut/hoppet over: $skipped. Ikke funnet: $fail."
echo "Restart Figma for at Systeminnstillinger skal vise riktig tilstand."
`;

const setupScript = `#!/bin/bash
# Legger til plassholder-rader for alle linjer under som IKKE starter med #.
# Sett # foran en linje for å utelate den variabelen fra Systeminnstillinger.
# Dekker Fyll/Padding/Gap/Radius/Text-menypunktene generert av generate.js.
#
# IDEMPOTENT: bruker PlistBuddy "Add" i stedet for "defaults write -dict-add".
# Add feiler (med vilje) hvis nøkkelen allerede finnes — så en snarvei du
# allerede har satt for en av disse radene blir ALDRI overskrevet/nullstilt.
# Kun rader som mangler helt får en ny, tom plassholder.

BUNDLE_ID="com.figma.Desktop"  # bekreft selv: osascript -e 'id of app "Figma"'
PLIST="$HOME/Library/Preferences/\${BUNDLE_ID}.plist"

BACKUP="$HOME/figma-shortcuts-backup-$(date +%s).plist"
defaults export "$BUNDLE_ID" "$BACKUP"
echo "Sikkerhetskopi lagret: $BACKUP"

osascript -e 'quit app "Figma"' 2>/dev/null || true
sleep 1
killall cfprefsd 2>/dev/null || true

# Sikre at selve NSUserKeyEquivalents-dictionaryet finnes (no-op hvis det gjør det)
/usr/libexec/PlistBuddy -c "Add :NSUserKeyEquivalents dict" "$PLIST" 2>/dev/null || true

added=0
kept=0
skipped=0
while IFS= read -r name; do
  [ -z "$name" ] && continue
  case "$name" in
    "#"*) skipped=$((skipped+1)); continue;;
  esac
  if /usr/libexec/PlistBuddy -c "Add :NSUserKeyEquivalents:\\"$name\\" string ${NBSP}" "$PLIST" 2>/dev/null; then
    added=$((added+1))
  else
    kept=$((kept+1))
  fi
done << '${DELIM}'
${names}
${DELIM}

killall cfprefsd 2>/dev/null || true
echo "Lagt til nye plassholdere: $added. Beholdt urørt (fantes allerede): $kept. Kommentert ut: $skipped."
echo "Restart Figma helt for at Systeminnstillinger skal vise dem."
`;

fs.writeFileSync(path.join(outDir, "undo-shortcuts.sh"), undoScript);
fs.writeFileSync(path.join(outDir, "setup-shortcut-placeholders.sh"), setupScript);
console.log(`Skrev begge scriptene med ${variables.length} variabler (fill+padding+gap+radius+text).`);