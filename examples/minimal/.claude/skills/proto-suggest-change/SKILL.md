---
name: proto-suggest-change
description: Sugerir un cambio al framework proto (@tleblancureta/proto). Abre un PR en tomasleblancu/proto con el fix propuesto. Activa cuando el usuario dice "sugiere este cambio al framework", "abre un PR en proto", "esto debería arreglarse en proto", o corre /proto-suggest-change.
type: framework
---

# proto-suggest-change

Flujo para que un desarrollador de una app proto proponga un bug fix o mejora al framework. El resultado es un PR en `tomasleblancu/proto` listo para revisión.

## Paso 1 — Detectar el cambio

Primero verificar si hay archivos modificados en `node_modules/@tleblancureta/proto/dist/`:

```bash
find node_modules/@tleblancureta/proto/dist -newer node_modules/@tleblancureta/proto/package.json -name "*.js" 2>/dev/null
```

- **Si hay archivos modificados**: usarlos como base del cambio propuesto. Mostrar el diff al usuario con `diff` o leyendo el archivo.
- **Si no hay nada**: pedirle al usuario que describa qué debería cambiar y en qué archivo del framework.

## Paso 2 — Mapear dist → source

| Archivo dist modificado | Archivo source en proto |
|---|---|
| `dist/core-gateway/X.js` | `packages/proto/core-gateway/X.ts` |
| `dist/core-mcp/X.js` | `packages/proto/core-mcp/src/X.ts` |
| `dist/core-web/X.js` | `packages/proto/core-web/src/X.ts` |
| `dist/core-shared/X.js` | `packages/proto/core-shared/src/X.ts` |

Leer el archivo source correspondiente para entender el contexto antes de aplicar.

## Paso 3 — Clonar proto y aplicar el cambio

```bash
PROTO_TMP=$(mktemp -d)
git clone https://github.com/tomasleblancu/proto.git "$PROTO_TMP"
```

Crear una rama con nombre descriptivo:

```bash
cd "$PROTO_TMP"
git checkout -b suggest/<kebab-slug-del-fix>
```

Aplicar el cambio equivalente en el archivo TypeScript source (nunca en dist). El cambio debe ser una traducción fiel del fix — no refactorizar ni agregar features adicionales.

## Paso 4 — Correr tests

```bash
cd "$PROTO_TMP" && npm install && npm test
```

Si los tests fallan: reportar al usuario con el output antes de continuar. No abrir el PR si hay failures relacionados con el cambio.

## Paso 5 — Abrir PR

```bash
cd "$PROTO_TMP"
git add <archivo>
git commit -m "suggest: <descripción concisa>"
git push origin suggest/<slug>
gh pr create \
  --repo tomasleblancu/proto \
  --title "suggest: <descripción>" \
  --body "$(cat <<'EOF'
## Cambio propuesto
<descripción del fix>

## Motivación
<por qué esto es un bug o mejora>

## Archivo afectado
`<path del source file>`

## Contexto
Sugerido desde app: <APP_NAME si está disponible en env/project.yaml, sino "unknown">
EOF
)"
```

Devolver la URL del PR al usuario.

## Reglas

- Aplicar siempre en TypeScript source, nunca en dist
- El branch name: `suggest/<slug>` en kebab-case, máx 40 chars
- No agregar cambios extra más allá del fix propuesto
- Si el usuario no tiene `gh` autenticado, indicarle que corra `gh auth login` primero
- Si el fix modifica tipos compartidos (`core-shared`), advertir que puede afectar múltiples partes del framework
- Limpiar el directorio temporal al finalizar: `rm -rf "$PROTO_TMP"`
