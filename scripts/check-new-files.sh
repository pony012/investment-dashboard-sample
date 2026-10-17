#!/bin/sh
# Compara los archivos que git subiría (no ignorados) contra la foto guardada en .git/info/files-snapshot.txt.
# Uso:  scripts/check-new-files.sh            -> lista archivos nuevos y modificados desde la foto
#       scripts/check-new-files.sh --save     -> toma una foto nueva
# Los archivos nuevos que aparezcan después de correr el pipeline con tus datos deben ir a .gitignore.
set -eu
cd "$(git rev-parse --show-toplevel)"
SNAP=.git/info/files-snapshot.txt
list() { { git ls-files; git ls-files -o --exclude-standard; } | sort -u | while IFS= read -r f; do [ -f "$f" ] && shasum -a 256 "$f"; done; }
if [ "${1:-}" = "--save" ]; then list > "$SNAP"; echo "Foto guardada: $(wc -l < "$SNAP" | tr -d ' ') archivos en $SNAP"; exit 0; fi
[ -f "$SNAP" ] || { echo "No hay foto; corre: scripts/check-new-files.sh --save"; exit 1; }
NOW=$(mktemp); list > "$NOW"
new=$(awk 'NR==FNR{seen[$2]=1; next} !($2 in seen){print $2}' "$SNAP" "$NOW")
changed=$(awk 'NR==FNR{h[$2]=$1; next} ($2 in h) && h[$2]!=$1 {print $2}' "$SNAP" "$NOW")
rm -f "$NOW"
[ -z "$new$changed" ] && { echo "Sin archivos nuevos ni modificados desde la foto."; exit 0; }
[ -n "$new" ] && { echo "Archivos NUEVOS que git subiría (agrégalos a .gitignore si son tuyos):"; echo "$new" | sed 's/^/  /'; }
[ -n "$changed" ] && { echo "Archivos MODIFICADOS desde la foto:"; echo "$changed" | sed 's/^/  /'; }
exit 2
