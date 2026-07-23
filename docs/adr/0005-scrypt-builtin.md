# 0005 - Hash de contraseñas con scrypt (built-in de Node crypto)

- Estado: Aceptado (2026-07-19, durante el hardening del PR #7)
- Deciders: @ahincho
- Supersedes: bcrypt (originalmente declarado en PR #5)

## Contexto y problema

Las contraseñas deben almacenarse como un hash one-way con un salt
por usuario. Los candidatos son:

1. **bcrypt** (paquete npm): muy conocido, tuneado para password
   hashing, pero suma una dependencia nativa externa.
2. **argon2** (paquete npm): ganador moderno del PHC, más caro de
   verificar, también dependencia nativa.
3. **scrypt** de `node:crypto`: built-in en Node 24, sin dependencias
   nativas, parámetros tuneables.

El bootstrap inicialmente se despachó con formato de almacenamiento
estilo `bcrypt` (decisión del PR #5) pero la implementación se
reescribió a **scrypt sin cambiar la superficie de la feature**,
sobre la base de que:

- Node 24 trae una implementación de scrypt auditada en `node:crypto`.
- `randomBytes` para salt y `timingSafeEqual` para verificación ya
  están disponibles.
- Sacar bcrypt remueve un native build que CI tiene que compilar en
  cada runner limpio (y que se gatea detrás de Python + compiladores).

## Decisión

Usamos **scrypt** con los parámetros baseline recomendados por OWASP:
`N = 16384`, `r = 8`, `p = 1`, output `keylen` de 64 bytes.

- Formato en el wire:
  `scrypt$N$r$p$salt$hash` (todo en base64url excepto los parámetros
  enteros).
- Salt: 16 bytes random por usuario.
- La verificación usa `timingSafeEqual` y re-deriva la clave con los
  mismos N/r/p antes de comparar.
- Cap de `maxmem: 256 MiB` (el techo de memoria de Cloud Lambda lo
  permite).

## Por qué no bcrypt

- bcrypt requiere un paquete externo; los native bindings suelen ser
  el step más lento de CI en runners greenfield.
- El work factor de bcrypt habría que re-tunearlo cada 2-3 años a
  medida que mejora el hardware; el factor `N` de scrypt es
  similarmente tuneable.
- Auditar una sola llamada a `node:crypto` es más fácil que auditar
  una dependencia transitiva.

## Consecuencias

### Positivas

- Cero dependencias nativas para autenticación.
- Formato de hash estable que sobrevive upgrades de versión de Node
  (el formato de encode es portable; solo el algoritmo subyacente
  puede evolucionar vía parámetros).
- Performance: scrypt con N=16384 es ~80 ms en una Lambda a 1792 MB;
  aceptable para una UX de registro/login.

### Negativas

- Perdemos la opción de cambiar de algoritmo de hash de contraseñas
  sin una historia de migración; un re-hash a futuro necesitaría una
  columna nueva para el nuevo algoritmo (el prefijo `alg` ya lo
  soporta: `scrypt$N$r$p$...`).
- El cap de `maxmem` de 256 MiB necesitará actualizarse si
  Aurora/EventBridge lo suben; tracked en tech debt.
