#!/bin/bash
# Legger til plassholder-rader for alle linjer under som IKKE starter med #.
# Sett # foran en linje for å utelate den variabelen fra Systeminnstillinger.
# Dekker Fyll/Padding/Gap/Radius/Text-menypunktene generert av generate.js.
#
# IDEMPOTENT: bruker PlistBuddy "Add" i stedet for "defaults write -dict-add".
# Add feiler (med vilje) hvis nøkkelen allerede finnes — så en snarvei du
# allerede har satt for en av disse radene blir ALDRI overskrevet/nullstilt.
# Kun rader som mangler helt får en ny, tom plassholder.

BUNDLE_ID="com.figma.Desktop"  # bekreft selv: osascript -e 'id of app "Figma"'
PLIST="$HOME/Library/Preferences/${BUNDLE_ID}.plist"

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
  if /usr/libexec/PlistBuddy -c "Add :NSUserKeyEquivalents:\"$name\" string  " "$PLIST" 2>/dev/null; then
    added=$((added+1))
  else
    kept=$((kept+1))
  fi
done << 'BIFROST_VAR_LIST_EOF'
Fyll - Base/bfc-base-1
Fyll - Base/bfc-base-2
Fyll - Base/bfc-base-3
Fyll - Base/bfc-base-dimmed
Fyll - Base/bfc-base-dimmed-2
Fyll - Base/bfc-base-dimmed-3
Fyll - Base/bfc-base-disabled
Fyll - Base/bfc-base-c-1
Fyll - Base/bfc-base-c-2
Fyll - Base/bfc-base-c-theme
Fyll - Base/bfc-base-c-brand
Fyll - Base/bfc-base-c-chill
Fyll - Base/bfc-base-c-attn
Fyll - Base/bfc-base-c-success
Fyll - Base/bfc-base-c-warning
Fyll - Base/bfc-base-c-alert
Fyll - Base/bfc-base-c-wcag
Fyll - Base/bfc-base-c-dimmed
Fyll - Base/bfc-base-c-disabled
Fyll - Base/bfc-base-c-inverted-1
Fyll - Base/bfc-base-c-inverted-2
Fyll - Base/bfc-base-c-inverted-3
Fyll - Theme/bfc-theme-1
Fyll - Theme/bfc-theme-2
Fyll - Theme/bfc-theme-3
Fyll - Theme/bfc-theme-c-1
Fyll - Theme/bfc-theme-c-2
Fyll - Theme/bfc-theme-hc
Fyll - Theme/bfc-theme-fade
Fyll - Theme/bfc-theme-fade-c
Fyll - Pop/Neutral/bfc-neutral
Fyll - Pop/Neutral/bfc-neutral-2
Fyll - Pop/Neutral/bfc-neutral-c
Fyll - Pop/Neutral/bfc-neutral-hc
Fyll - Pop/Neutral/bfc-neutral-fade
Fyll - Pop/Neutral/bfc-neutral-fade-c
Fyll - Pop/Brand/bfc-brand
Fyll - Pop/Brand/bfc-brand-c
Fyll - Pop/Brand/bfc-brand-hc
Fyll - Pop/Brand/bfc-brand-fade
Fyll - Pop/Brand/bfc-brand-fade-c
Fyll - Pop/Chill/bfc-chill
Fyll - Pop/Chill/bfc-chill-c
Fyll - Pop/Chill/bfc-chill-hc
Fyll - Pop/Chill/bfc-chill-fade
Fyll - Pop/Chill/bfc-chill-fade-c
Fyll - Pop/Attention/bfc-attn
Fyll - Pop/Success/bfc-success
Fyll - Pop/Success/bfc-success-c
Fyll - Pop/Success/bfc-success-hc
Fyll - Pop/Success/bfc-success-fade
Fyll - Pop/Success/bfc-success-fade-c
Fyll - Pop/Attention/bfc-attn-c
Fyll - Pop/Attention/bfc-attn-hc
Fyll - Pop/Attention/bfc-attn-fade
Fyll - Pop/Attention/bfc-attn-fade-c
Fyll - Pop/Warning/bfc-warning
Fyll - Pop/Warning/bfc-warning-c
Fyll - Pop/Warning/bfc-warning-hc
Fyll - Pop/Warning/bfc-warning-fade
Fyll - Pop/Warning/bfc-warning-fade-c
Fyll - Pop/Alert/bfc-alert
Fyll - Pop/Alert/bfc-alert-2
Fyll - Pop/Alert/bfc-alert-c
Fyll - Pop/Alert/bfc-alert-hc
Fyll - Pop/Alert/bfc-alert-fade
Fyll - Pop/Alert/bfc-alert-fade-c
Fyll - Pop/Alert/bfc-alert-fade-2
Fyll - Pop/Alert/bfc-alert-fade-2-c
Fyll - Miscellaneous/bfc-overlay
Fyll - Miscellaneous/bfc-overlay-c
Fyll - Miscellaneous/ios-browser-bg
Fyll - Miscellaneous/transparent-base-3
Fyll - Miscellaneous/transparent-base-2
Fyll - Miscellaneous/transparent-base-1
Fyll - Miscellaneous/transparent-base-dimmed
Fyll - Miscellaneous/high-contrast
Fyll - Miscellaneous/high-contrast-inv
Fyll - Effect variables/Shadows/Opacity/bfc-theme-1-40
Fyll - Effect variables/Shadows/Opacity/bfc-shadow
Fyll - Effect variables/Shadows/Opacity/200
Fyll - Effect variables/Shadows/Opacity/300
Fyll - Effect variables/Shadows/Opacity/400
Fyll - Teal/0
Fyll - Teal/10
Fyll - Teal/20
Fyll - Teal/30
Fyll - Teal/40
Fyll - Teal/50
Fyll - Teal/60
Fyll - Teal/70
Fyll - Teal/80
Fyll - Teal/90
Fyll - Teal/100
Fyll - Teal/110
Fyll - Teal/120
Fyll - Teal/130
Fyll - Teal/140
Fyll - Teal/150
Fyll - Teal/160
Fyll - Teal/170
Fyll - Teal/180
Fyll - Teal/190
Fyll - Teal/200
Fyll - Teal/210
Fyll - Teal/220
Fyll - Teal/230
Fyll - Teal/240
Fyll - Teal/250
Fyll - Teal/260
Fyll - Teal/270
Fyll - Teal/280
Fyll - Teal/290
Fyll - Teal/300
Fyll - Teal/310
Fyll - Teal/320
Fyll - Teal/330
Fyll - Teal/340
Fyll - Teal/350
Fyll - Teal/360
Fyll - Teal/370
Fyll - Teal/380
Fyll - Teal/390
Fyll - Teal/400
Fyll - Teal/410
Fyll - Teal/420
Fyll - Teal/430
Fyll - Teal/440
Fyll - Teal/450
Fyll - Teal/460
Fyll - Teal/470
Fyll - Teal/480
Fyll - Teal/490
Fyll - Teal/500
Fyll - Teal/510
Fyll - Teal/520
Fyll - Teal/530
Fyll - Teal/540
Fyll - Teal/550
Fyll - Teal/560
Fyll - Teal/570
Fyll - Teal/580
Fyll - Teal/590
Fyll - Teal/600
Fyll - Teal/610
Fyll - Teal/620
Fyll - Teal/630
Fyll - Teal/640
Fyll - Teal/650
Fyll - Teal/660
Fyll - Teal/670
Fyll - Teal/680
Fyll - Teal/690
Fyll - Teal/700
Fyll - Teal/710
Fyll - Teal/720
Fyll - Teal/730
Fyll - Teal/740
Fyll - Teal/750
Fyll - Teal/760
Fyll - Teal/770
Fyll - Teal/780
Fyll - Teal/790
Fyll - Teal/800
Fyll - Teal/810
Fyll - Teal/820
Fyll - Teal/830
Fyll - Teal/840
Fyll - Teal/850
Fyll - Teal/860
Fyll - Teal/870
Fyll - Teal/880
Fyll - Teal/890
Fyll - Teal/900
Fyll - Teal/910
Fyll - Teal/920
Fyll - Teal/930
Fyll - Teal/940
Fyll - Teal/950
Fyll - Teal/960
Fyll - Teal/970
Fyll - Teal/980
Fyll - Teal/990
Fyll - Teal/1000
Fyll - Purple/0
Fyll - Pink/0
Fyll - Pink/10
Fyll - Pink/20
Fyll - Pink/30
Fyll - Pink/40
Fyll - Pink/50
Fyll - Pink/60
Fyll - Pink/70
Fyll - Pink/80
Fyll - Pink/90
Fyll - Pink/100
Fyll - Pink/110
Fyll - Pink/120
Fyll - Pink/130
Fyll - Pink/140
Fyll - Pink/150
Fyll - Pink/160
Fyll - Pink/170
Fyll - Pink/180
Fyll - Pink/190
Fyll - Pink/200
Fyll - Pink/210
Fyll - Pink/220
Fyll - Pink/230
Fyll - Pink/240
Fyll - Pink/250
Fyll - Pink/260
Fyll - Pink/270
Fyll - Pink/280
Fyll - Pink/290
Fyll - Pink/300
Fyll - Pink/310
Fyll - Pink/320
Fyll - Pink/330
Fyll - Pink/340
Fyll - Pink/350
Fyll - Pink/360
Fyll - Pink/370
Fyll - Pink/380
Fyll - Pink/390
Fyll - Pink/400
Fyll - Pink/410
Fyll - Pink/420
Fyll - Pink/430
Fyll - Pink/440
Fyll - Pink/450
Fyll - Pink/460
Fyll - Pink/470
Fyll - Pink/480
Fyll - Pink/490
Fyll - Pink/500
Fyll - Pink/510
Fyll - Pink/520
Fyll - Pink/530
Fyll - Pink/540
Fyll - Pink/550
Fyll - Pink/560
Fyll - Pink/570
Fyll - Pink/580
Fyll - Pink/590
Fyll - Pink/600
Fyll - Pink/610
Fyll - Pink/620
Fyll - Pink/630
Fyll - Pink/640
Fyll - Pink/650
Fyll - Pink/660
Fyll - Pink/670
Fyll - Pink/680
Fyll - Pink/690
Fyll - Pink/700
Fyll - Pink/710
Fyll - Pink/720
Fyll - Pink/730
Fyll - Pink/740
Fyll - Pink/750
Fyll - Pink/760
Fyll - Pink/770
Fyll - Pink/780
Fyll - Pink/790
Fyll - Pink/800
Fyll - Pink/810
Fyll - Pink/820
Fyll - Pink/830
Fyll - Pink/840
Fyll - Pink/850
Fyll - Pink/860
Fyll - Pink/870
Fyll - Pink/880
Fyll - Pink/890
Fyll - Pink/900
Fyll - Pink/910
Fyll - Pink/920
Fyll - Pink/930
Fyll - Pink/940
Fyll - Pink/950
Fyll - Pink/960
Fyll - Pink/970
Fyll - Pink/980
Fyll - Pink/990
Fyll - Pink/1000
Fyll - Purple/10
Fyll - Purple/20
Fyll - Purple/30
Fyll - Purple/40
Fyll - Purple/50
Fyll - Purple/60
Fyll - Purple/70
Fyll - Purple/80
Fyll - Purple/90
Fyll - Purple/100
Fyll - Purple/110
Fyll - Purple/120
Fyll - Purple/130
Fyll - Purple/140
Fyll - Purple/150
Fyll - Purple/160
Fyll - Purple/170
Fyll - Purple/180
Fyll - Purple/190
Fyll - Purple/200
Fyll - Purple/210
Fyll - Purple/220
Fyll - Purple/230
Fyll - Purple/240
Fyll - Purple/250
Fyll - Purple/260
Fyll - Purple/270
Fyll - Purple/280
Fyll - Purple/290
Fyll - Purple/300
Fyll - Purple/310
Fyll - Purple/320
Fyll - Purple/330
Fyll - Purple/340
Fyll - Purple/350
Fyll - Purple/360
Fyll - Purple/370
Fyll - Purple/380
Fyll - Purple/390
Fyll - Purple/400
Fyll - Purple/410
Fyll - Purple/420
Fyll - Purple/430
Fyll - Purple/440
Fyll - Purple/450
Fyll - Purple/460
Fyll - Purple/470
Fyll - Purple/480
Fyll - Purple/490
Fyll - Purple/500
Fyll - Purple/510
Fyll - Purple/520
Fyll - Purple/530
Fyll - Purple/540
Fyll - Purple/550
Fyll - Purple/560
Fyll - Purple/570
Fyll - Purple/580
Fyll - Purple/590
Fyll - Purple/600
Fyll - Purple/610
Fyll - Purple/620
Fyll - Purple/630
Fyll - Purple/640
Fyll - Purple/650
Fyll - Purple/660
Fyll - Purple/670
Fyll - Purple/680
Fyll - Purple/690
Fyll - Purple/700
Fyll - Purple/710
Fyll - Purple/720
Fyll - Purple/730
Fyll - Purple/740
Fyll - Purple/750
Fyll - Purple/760
Fyll - Purple/770
Fyll - Purple/780
Fyll - Purple/790
Fyll - Purple/800
Fyll - Purple/810
Fyll - Purple/820
Fyll - Purple/830
Fyll - Purple/840
Fyll - Purple/850
Fyll - Purple/860
Fyll - Purple/870
Fyll - Purple/880
Fyll - Purple/890
Fyll - Purple/900
Fyll - Purple/910
Fyll - Purple/920
Fyll - Purple/930
Fyll - Purple/940
Fyll - Purple/950
Fyll - Purple/960
Fyll - Purple/970
Fyll - Purple/980
Fyll - Purple/990
Fyll - Purple/1000
Fyll - Green/0
Fyll - Green/10
Fyll - Green/20
Fyll - Green/30
Fyll - Green/40
Fyll - Green/50
Fyll - Green/60
Fyll - Green/70
Fyll - Green/80
Fyll - Green/90
Fyll - Green/100
Fyll - Green/110
Fyll - Green/120
Fyll - Green/130
Fyll - Green/140
Fyll - Green/150
Fyll - Green/160
Fyll - Green/170
Fyll - Green/180
Fyll - Green/190
Fyll - Green/200
Fyll - Green/210
Fyll - Green/220
Fyll - Green/230
Fyll - Green/240
Fyll - Green/250
Fyll - Green/260
Fyll - Green/270
Fyll - Green/280
Fyll - Green/290
Fyll - Green/300
Fyll - Green/310
Fyll - Green/320
Fyll - Green/330
Fyll - Green/340
Fyll - Green/350
Fyll - Green/360
Fyll - Green/370
Fyll - Green/380
Fyll - Green/390
Fyll - Green/400
Fyll - Green/410
Fyll - Green/420
Fyll - Green/430
Fyll - Green/440
Fyll - Green/450
Fyll - Green/460
Fyll - Green/470
Fyll - Green/480
Fyll - Green/490
Fyll - Green/500
Fyll - Green/510
Fyll - Green/520
Fyll - Green/530
Fyll - Green/540
Fyll - Green/550
Fyll - Green/560
Fyll - Green/570
Fyll - Green/580
Fyll - Green/590
Fyll - Green/600
Fyll - Green/610
Fyll - Green/620
Fyll - Green/630
Fyll - Green/640
Fyll - Green/650
Fyll - Green/660
Fyll - Green/670
Fyll - Green/680
Fyll - Green/690
Fyll - Green/700
Fyll - Green/710
Fyll - Green/720
Fyll - Green/730
Fyll - Green/740
Fyll - Green/750
Fyll - Green/760
Fyll - Green/770
Fyll - Green/780
Fyll - Green/790
Fyll - Green/800
Fyll - Green/810
Fyll - Green/820
Fyll - Green/830
Fyll - Green/840
Fyll - Green/850
Fyll - Green/860
Fyll - Green/870
Fyll - Green/880
Fyll - Green/890
Fyll - Green/900
Fyll - Green/910
Fyll - Green/920
Fyll - Green/930
Fyll - Green/940
Fyll - Green/950
Fyll - Green/960
Fyll - Green/970
Fyll - Green/980
Fyll - Green/990
Fyll - Green/1000
Fyll - Yellow/0
Fyll - Yellow/10
Fyll - Yellow/20
Fyll - Yellow/30
Fyll - Yellow/40
Fyll - Yellow/50
Fyll - Yellow/60
Fyll - Yellow/70
Fyll - Yellow/80
Fyll - Yellow/90
Fyll - Yellow/100
Fyll - Yellow/110
Fyll - Yellow/120
Fyll - Yellow/130
Fyll - Yellow/140
Fyll - Yellow/150
Fyll - Yellow/160
Fyll - Yellow/170
Fyll - Yellow/180
Fyll - Yellow/190
Fyll - Yellow/200
Fyll - Yellow/210
Fyll - Yellow/220
Fyll - Yellow/230
Fyll - Yellow/240
Fyll - Yellow/250
Fyll - Yellow/260
Fyll - Yellow/270
Fyll - Yellow/280
Fyll - Yellow/290
Fyll - Yellow/300
Fyll - Yellow/310
Fyll - Yellow/320
Fyll - Yellow/330
Fyll - Yellow/340
Fyll - Yellow/350
Fyll - Yellow/360
Fyll - Yellow/370
Fyll - Yellow/380
Fyll - Yellow/390
Fyll - Yellow/400
Fyll - Yellow/410
Fyll - Yellow/420
Fyll - Yellow/430
Fyll - Yellow/440
Fyll - Yellow/450
Fyll - Yellow/460
Fyll - Yellow/470
Fyll - Yellow/480
Fyll - Yellow/490
Fyll - Yellow/500
Fyll - Yellow/510
Fyll - Yellow/520
Fyll - Yellow/530
Fyll - Yellow/540
Fyll - Yellow/550
Fyll - Yellow/560
Fyll - Yellow/570
Fyll - Yellow/580
Fyll - Yellow/590
Fyll - Yellow/600
Fyll - Yellow/610
Fyll - Yellow/620
Fyll - Yellow/630
Fyll - Yellow/640
Fyll - Yellow/650
Fyll - Yellow/660
Fyll - Yellow/670
Fyll - Yellow/680
Fyll - Yellow/690
Fyll - Yellow/700
Fyll - Yellow/710
Fyll - Yellow/720
Fyll - Yellow/730
Fyll - Yellow/740
Fyll - Yellow/750
Fyll - Yellow/760
Fyll - Yellow/770
Fyll - Yellow/780
Fyll - Yellow/790
Fyll - Yellow/800
Fyll - Yellow/810
Fyll - Yellow/820
Fyll - Yellow/830
Fyll - Yellow/840
Fyll - Yellow/850
Fyll - Yellow/860
Fyll - Yellow/870
Fyll - Yellow/880
Fyll - Yellow/890
Fyll - Yellow/900
Fyll - Yellow/910
Fyll - Yellow/920
Fyll - Yellow/930
Fyll - Yellow/940
Fyll - Yellow/950
Fyll - Yellow/960
Fyll - Yellow/970
Fyll - Yellow/980
Fyll - Yellow/990
Fyll - Yellow/1000
Fyll - Red/0
Fyll - Red/10
Fyll - Red/20
Fyll - Red/30
Fyll - Red/40
Fyll - Red/50
Fyll - Red/60
Fyll - Red/70
Fyll - Red/80
Fyll - Red/90
Fyll - Red/100
Fyll - Red/110
Fyll - Red/120
Fyll - Red/130
Fyll - Red/140
Fyll - Red/150
Fyll - Red/160
Fyll - Red/170
Fyll - Red/180
Fyll - Red/190
Fyll - Red/200
Fyll - Red/210
Fyll - Red/220
Fyll - Red/230
Fyll - Red/240
Fyll - Red/250
Fyll - Red/260
Fyll - Red/270
Fyll - Red/280
Fyll - Red/290
Fyll - Red/300
Fyll - Red/310
Fyll - Red/320
Fyll - Red/330
Fyll - Red/340
Fyll - Red/350
Fyll - Red/360
Fyll - Red/370
Fyll - Red/380
Fyll - Red/390
Fyll - Red/400
Fyll - Red/410
Fyll - Red/420
Fyll - Red/430
Fyll - Red/440
Fyll - Red/450
Fyll - Red/460
Fyll - Red/470
Fyll - Red/480
Fyll - Red/490
Fyll - Red/500
Fyll - Red/510
Fyll - Red/520
Fyll - Red/530
Fyll - Red/540
Fyll - Red/550
Fyll - Red/560
Fyll - Red/570
Fyll - Red/580
Fyll - Red/590
Fyll - Red/600
Fyll - Red/610
Fyll - Red/620
Fyll - Red/630
Fyll - Red/640
Fyll - Red/650
Fyll - Red/660
Fyll - Red/670
Fyll - Red/680
Fyll - Red/690
Fyll - Red/700
Fyll - Red/710
Fyll - Red/720
Fyll - Red/730
Fyll - Red/740
Fyll - Red/750
Fyll - Red/760
Fyll - Red/770
Fyll - Red/780
Fyll - Red/790
Fyll - Red/800
Fyll - Red/810
Fyll - Red/820
Fyll - Red/830
Fyll - Red/840
Fyll - Red/850
Fyll - Red/860
Fyll - Red/870
Fyll - Red/880
Fyll - Red/890
Fyll - Red/900
Fyll - Red/910
Fyll - Red/920
Fyll - Red/930
Fyll - Red/940
Fyll - Red/950
Fyll - Red/960
Fyll - Red/970
Fyll - Red/980
Fyll - Red/990
Fyll - Red/1000
Fyll - Gray/50
Fyll - Gray/100
Fyll - Gray/150
Fyll - Gray/800
Fyll - Gray/920
Fyll - Gray/970
Fyll - Light/Theme/base-c-theme
Fyll - Light/Theme/theme-1
Fyll - Light/Theme/theme-2
Fyll - Light/Theme/theme-3
Fyll - Light/Theme/theme-c-1
Fyll - Light/Theme/theme-c-2
Fyll - Light/Theme/theme-hc
Fyll - Light/Theme/Fade/theme-fade
Fyll - Light/Theme/Fade/theme-fade-c
Fyll - Dark/Theme/base-c-theme
Fyll - Dark/Theme/theme-1
Fyll - Dark/Theme/theme-2
Fyll - Dark/Theme/theme-3
Fyll - Dark/Theme/theme-c-1
Fyll - Dark/Theme/theme-c-2
Fyll - Dark/Theme/theme-hc
Fyll - Dark/Theme/Fade/theme-fade
Fyll - Dark/Theme/Fade/theme-fade-c
Fyll - 0
Fyll - 10
Fyll - 20
Fyll - 30
Fyll - 40
Fyll - 50
Fyll - 60
Fyll - 70
Fyll - 80
Fyll - 90
Fyll - 100
Fyll - 110
Fyll - 120
Fyll - 130
Fyll - 140
Fyll - 150
Fyll - 160
Fyll - 170
Fyll - 180
Fyll - 190
Fyll - 200
Fyll - 210
Fyll - 220
Fyll - 230
Fyll - 240
Fyll - 250
Fyll - 260
Fyll - 270
Fyll - 280
Fyll - 290
Fyll - 300
Fyll - 310
Fyll - 320
Fyll - 330
Fyll - 340
Fyll - 350
Fyll - 360
Fyll - 370
Fyll - 380
Fyll - 390
Fyll - 400
Fyll - 410
Fyll - 420
Fyll - 430
Fyll - 440
Fyll - 450
Fyll - 460
Fyll - 470
Fyll - 480
Fyll - 490
Fyll - 500
Fyll - 510
Fyll - 520
Fyll - 530
Fyll - 540
Fyll - 550
Fyll - 560
Fyll - 570
Fyll - 580
Fyll - 590
Fyll - 600
Fyll - 610
Fyll - 620
Fyll - 630
Fyll - 640
Fyll - 650
Fyll - 660
Fyll - 670
Fyll - 680
Fyll - 690
Fyll - 700
Fyll - 710
Fyll - 720
Fyll - 730
Fyll - 740
Fyll - 750
Fyll - 760
Fyll - 770
Fyll - 780
Fyll - 790
Fyll - 800
Fyll - 810
Fyll - 820
Fyll - 830
Fyll - 840
Fyll - 850
Fyll - 860
Fyll - 870
Fyll - 880
Fyll - 890
Fyll - 900
Fyll - 910
Fyll - 920
Fyll - 930
Fyll - 940
Fyll - 950
Fyll - 960
Fyll - 970
Fyll - 980
Fyll - 990
Fyll - 1000
Padding - None
Padding - XXS
Padding - XS
Padding - S
Padding - M
Padding - L
Padding - XL
Padding - XXL
Padding - 3XL
Padding - 4XL
Padding - 5XL
Padding - 6XL
Gap - None
Gap - XXS
Gap - XS
Gap - S
Gap - M
Gap - L
Gap - XL
Gap - XXL
Gap - 3XL
Gap - 4XL
Gap - 5XL
Gap - 6XL
Radius - None
Radius - XS
Radius - S
Radius - M
Radius - L
Radius - XL
Radius - Full
Text - S/Open Sans/Regular/Text
Text - S/Open Sans/Regular/Link
Text - S/Open Sans/Semibold/Text
Text - S/Open Sans/Semibold/Link
Text - S/Open Sans/Italic/Text
Text - S/Open Sans/Italic/Link
Text - S/Open Sans/Semibold italic/Text
Text - S/Open Sans/Semibold italic/Link
Text - S/Font Awesome/Regular
Text - S/Font Awesome/Solid
Text - S/Font Awesome/Duotone
Text - S/Font Awesome/Brands
Text - M/Open Sans/Regular/Text
Text - M/Open Sans/Regular/Link
Text - M/Open Sans/Semibold/Text
Text - M/Open Sans/Semibold/Link
Text - M/Open Sans/Italic/Text
Text - M/Open Sans/Italic/Link
Text - M/Open Sans/Semibold italic/Text
Text - M/Open Sans/Semibold italic/Link
Text - M/Font Awesome/Regular
Text - M/Font Awesome/Solid
Text - M/Font Awesome/Duotone
Text - M/Font Awesome/Brands
Text - L/Open Sans/Regular/Text
Text - L/Open Sans/Regular/Link
Text - L/Open Sans/Semibold/Text
Text - L/Open Sans/Semibold/Link
Text - L/Open Sans/Italic/Text
Text - L/Open Sans/Italic/Link
Text - L/Open Sans/Semibold italic/Text
Text - L/Open Sans/Semibold italic/Link
Text - L/Font Awesome/Regular
Text - L/Font Awesome/Solid
Text - L/Font Awesome/Duotone
Text - L/Font Awesome/Brands
Text - H5/Satoshi/Text
Text - H5/Satoshi/Link
Text - H5/Font Awesome/Regular
Text - H5/Font Awesome/Solid
Text - H5/Font Awesome/Duotone
Text - H5/Font Awesome/Brands
Text - H4/Satoshi/Text
Text - H4/Satoshi/Link
Text - H4/Font Awesome/Regular
Text - H4/Font Awesome/Solid
Text - H4/Font Awesome/Duotone
Text - H4/Font Awesome/Brands
Text - H3/Satoshi/Text
Text - H3/Satoshi/Link
Text - H3/Font Awesome/Regular
Text - H3/Font Awesome/Solid
Text - H3/Font Awesome/Duotone
Text - H3/Font Awesome/Brands
Text - H2/Satoshi/Text
Text - H2/Satoshi/Link
Text - H2/Font Awesome/Light
Text - H2/Font Awesome/Regular
Text - H2/Font Awesome/Solid
Text - H2/Font Awesome/Duotone
Text - H2/Font Awesome/Brands
Text - H1/Satoshi/Text
Text - H1/Satoshi/Link
Text - H1/Font Awesome/Light
Text - H1/Font Awesome/Regular
Text - H1/Font Awesome/Solid
Text - H1/Font Awesome/Duotone
Text - H1/Font Awesome/Brands
BIFROST_VAR_LIST_EOF

killall cfprefsd 2>/dev/null || true
echo "Lagt til nye plassholdere: $added. Beholdt urørt (fantes allerede): $kept. Kommentert ut: $skipped."
echo "Restart Figma helt for at Systeminnstillinger skal vise dem."
