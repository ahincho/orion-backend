# 0008 - Amazon EventBridge como bus entre contextos

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

Los bounded contexts deben comunicarse sin tocar las bases de datos
del otro. Necesitamos un transporte para eventos de dominio (no
commands): algo que le permita a cualquier contexto suscribirse a
"todo lo publicado en el contexto X" sin tomar una dependencia del
stack del publicador.

## Decisión

Usamos un **bus de EventBridge** llamado
`orion-events-${Environment}` (ej. `orion-events-dev`).

- **Source por evento:** `orion.<context>` (ej. `orion.census`,
  `orion.identity`).
- **Detail type:** PascalCase en pasado (`CensusAssigned`,
  `UserRegistered`, `PasswordChanged`).
- **Detail payload (envelope):** `{ version: 1, data: { ... } }` así
  los consumers pueden detectar y rechazar mixes viejo-nuevo.
- **Los publicadores** usan un único cliente en `@orion/shared/events`:
  - `publish(event)` -> evento único con backoff exponencial 3x y
    aserción `FailedEntryCount === 0`.
  - `publishMany(events)` -> chunks de 10, retry on
    `FailedEntryCount > 0`, manejo de fallos parciales.
- **Los consumers** (en fases posteriores) son reglas Lambda (Phase
  2+); el bootstrap solo publica.

## Por qué EventBridge (no SNS / SQS / Kafka)

- EventBridge es la forma AWS-native de modelar eventos de dominio
  (sin queue compartida, sin código de consumer en el publicador).
- Soporte cross-account gratis (por si `orion-cognitive-agent`
  consume en otra cuenta AWS en el futuro).
- Retención de 24 horas + targets DLQ-able vienen built-in.
- SQS es una queue (cada consumer necesita su propia queue + IAM);
  demasiado bajo nivel para "eventos de dominio".
- Kafka es un impuesto operacional para el que no estamos listos en
  el bootstrap.

## Consecuencias

### Positivas

- Publicadores y suscriptores desacoplados por diseño.
- El schema (el envelope `{ version, data }`) es una shape
  forward-compatible que permite a los consumers rechazar versiones
  desconocidas limpio.
- Retención y replay configurables.

### Negativas

- EventBridge tiene un techo rígido de 256 KB por evento. Mantenemos
  los payloads chicos; el shared kernel lo enforza.
- La emulación local de EventBridge es aproximada; los tests de
  integración requieren una cuenta AWS live.
- El schema registry (ej. Glue Registry o AppSync) **no** se usa
  todavía, así que los contratos de evento viven en los schemas Zod
  de este repo (y pueden drift si no hay disciplina). Un ADR en
  Phase 2 revisitará.
