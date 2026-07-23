# 0002 - AWS SAM como herramienta de IaC para el backend

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

¿Cómo declaramos los stacks de CloudFormation para un monolito serverless
DDD+EDA? Opciones consideradas: AWS CDK, Terraform, Pulumi, CloudFormation
crudo, AWS SAM. Cada una tiene distinto costo de setup, type safety,
experiencia local-dev y harness de deploy.

## Decisión

Usamos **AWS SAM** (`template.yaml` raíz + `template.yaml` anidado por
bounded context) para la capa de aplicación (HTTP API v2 + Lambdas +
Layers + bus de EventBridge). Las capas de red/datos (VPC, RDS Aurora,
state backend) las posee el repo separado `orion-infrastructure`
(Terraform) porque esa es la convención multi-repo más amplia.

- **Por qué SAM (no CDK):** los templates SAM mapean 1:1 a
  CloudFormation, lo que mantiene la superficie de API idéntica a la
  que AWS expone, evita el overhead de bootstrap/CDKTF de CDK y se
  mantiene corto (cada stack de contexto entra en ~150 líneas).
- **Por qué SAM (no CFN crudo):** SAM suma `sam local invoke`,
  `sam local start-api`, `sam build`, policy templates y el perfil
  de deploy `samconfig.toml` que el CFN crudo no trae.
- **Por qué no Terraform:** Terraform para la lógica de aplicación
  arrastra dos state files y dos herramientas de deploy (una para data
  plane, otra para app plane). SAM es la herramienta más chica para
  solo la superficie de Lambda.
- **Por qué separar responsabilidades de IaC:** `orion-infrastructure`
  posee recursos compartidos entre servicios (RDS proxy, VPC, KMS);
  acoplarlos al repo del backend crearía drift Terraform-a-SAM en cada
  release.

## Consecuencias

### Positivas

- `sam build && sam deploy --guided` funciona el mismo día que se
  clona el repo.
- Una herramienta para el bootstrap; CDK/Terraform se pueden agregar
  más adelante si aparece una mejor herramienta.
- Emulación local de la API: `sam local start-api` alcanza para los
  flujos de identity/census durante la integración.

### Negativas

- Las policies de SAM son más ruidosas que los módulos de Terraform
  (no hay `for_each` sobre Lambdas por tag); aceptamos la verbosidad
  del YAML porque cada bounded context solo tiene 1-4 Lambdas.
- El wiring cross-stack (ARN del bus de EventBridge, ARN de secrets)
  cruza la frontera del repo; los pasamos como env-vars sourced from
  SSM (vía `{{resolve:ssm:/orion/...}}` en los templates y
  `createSecretsReader()` en runtime).
- Dos dialectos de IaC en el proyecto (SAM acá, Terraform en
  infrastructure); documentado en el README de onboarding del repo.
