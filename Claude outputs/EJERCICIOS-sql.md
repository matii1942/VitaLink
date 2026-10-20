# Diez ejercicios, dos bases de datos

La regla: **cada ejercicio se hace en las dos**. Primero escribilo, después
corrélo, y recién después mirá la solución. El valor está en el momento en que
una de las dos te tira un error y la otra no.

Las soluciones están al final, numeradas igual.

---

## 1 — Lo que ya sabés: un INNER JOIN

Listá el apellido, la sala y el diagnóstico de **todos los pacientes que
siguen internados** (los que tienen `discharged_at` en `NULL`), ordenados por
apellido.

> Esto tiene que darte lo mismo, carácter por carácter, en las dos. Es el
> punto de partida: la mayor parte de lo que hacías en MySQL se traslada tal
> cual.

## 2 — El paciente que nadie midió: LEFT JOIN

Listá cada internación abierta con la **cantidad de observaciones** que tiene.
Una de las internaciones no tiene ninguna. Tiene que aparecer igual, con cero.

> Si te aparecen cinco filas en vez de seis, usaste `INNER JOIN`. El paciente
> que nadie midió es justamente el que no puede desaparecer de un tablero.

## 3 — Pegar dos textos

Mostrá una columna `nombre` con el formato `APELLIDO, Nombre`.

> Acá se separan. Escribí primero la versión con `||`, corrélа en las dos, y
> mirá bien lo que devuelve MySQL antes de leer la solución: **no da error**,
> te devuelve otra cosa. Ese es el peor tipo de diferencia.

## 4 — Las comillas

Buscá las pacientes mujeres, escribiendo la condición como
`WHERE sex = "female"`, con **comillas dobles**.

> Una de las dos lo acepta y la otra te dice que no existe la columna
> `female`. Entender por qué es entender la regla más importante del cambio de
> dialecto.

## 5 — Buscar sin importar mayúsculas

Buscá el paciente cuyo apellido contiene `medina`, escrito **en minúscula**.

> Una lo encuentra y la otra no. Después hacé que la que no lo encuentra lo
> encuentre.

## 6 — Contar dos cosas de una sola pasada

Por cada sala, mostrá cuántas internaciones están **abiertas** y cuántas hubo
**en total**. Una sola consulta, una sola pasada por la tabla.

> En PostgreSQL hay una cláusula hecha exactamente para esto. En MySQL no
> existe y hay que resolverlo de otra manera. Las dos versiones dan el mismo
> resultado; una se lee mejor.

## 7 — El booleano que no es booleano

Mostrá el `mrn` y la columna `urgent` de las primeras tres internaciones.

> Fijate qué te devuelve cada una en la columna `urgent`. Si tu código de
> aplicación espera `true` y `false`, esto importa.

## 8 — La última observación de cada paciente

El ejercicio central, y el mismo problema que resuelve el tablero de VitaLink:
por cada internación abierta, traer **su observación más reciente** (fecha y
NEWS2), ordenadas de mayor a menor NEWS2. La internación sin observaciones
tiene que seguir apareciendo.

Hay tres formas de hacerlo mal antes de hacerlo bien:

- Traer todas las observaciones y quedarte con la última en el código. Lee la
  historia entera de la sala para usar una fila de cada paciente.
- Una consulta por internación. Es el problema **N+1**: una consulta para la
  lista, y N más, una por cada fila.
- Un `JOIN` contra un `MAX(recorded_at)` agrupado. Funciona, pero si dos
  observaciones comparten el instante te duplica la fila.

La forma buena es distinta en cada base. Intentá las dos.

> Pista para PostgreSQL: `LEFT JOIN LATERAL (...) ON TRUE`. Un `LATERAL` deja
> que la subconsulta **mire la fila de afuera**, así que podés pedirle
> `ORDER BY ... LIMIT 1` una vez por internación.
>
> Pista para MySQL: `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` dentro
> de un `WITH`, y después te quedás con las filas donde el número es 1.

## 9 — Restar tiempo

Contá cuántas observaciones se registraron en las **últimas 48 horas** contadas
desde el 27 de septiembre de 2026 a las 00:00.

> La palabra `INTERVAL` existe en las dos y se escribe distinto en cada una.

## 10 — El GROUP BY incompleto

Corré esto tal cual en las dos:

```sql
SELECT ward, diagnosis, count(*) FROM admission GROUP BY ward;
```

> **Este es el ejercicio importante y no tiene solución "correcta": tiene una
> lección.** La consulta está mal: pedís `diagnosis` sin agruparlo ni
> agregarlo, y cada sala tiene varios diagnósticos distintos, así que la
> pregunta "¿cuál de todos?" no tiene respuesta.
>
> PostgreSQL te lo dice y se niega. MySQL 8, con su configuración por defecto
> (`ONLY_FULL_GROUP_BY`), también se niega. Pero **MySQL 5.7 y MariaDB lo
> aceptan** y te devuelven un diagnóstico cualquiera de los que había, sin
> avisarte.
>
> Yo verifiqué este ejercicio contra MariaDB y me lo aceptó. Vos lo vas a
> correr contra MySQL 8 y probablemente te dé error. Las dos cosas son
> ciertas, y el motivo es esa configuración.
>
> Esto es exactamente cómo una consulta "que siempre anduvo" se rompe el día
> que migran el servidor. Y si vos tocaste MySQL en la clínica hace unos años,
> puede que hayas escrito consultas así sin que nadie te dijera nada.

---
---

# Soluciones

## 1 — INNER JOIN

Igual en las dos:

```sql
SELECT p.family_name, a.ward, a.diagnosis
FROM admission a
INNER JOIN patient p ON p.id = a.patient_id
WHERE a.discharged_at IS NULL
ORDER BY p.family_name;
```

Seis filas: BORREGO, CARRERA, MEDINA, OCASIO, VERGARA, ZAYAS.

## 2 — LEFT JOIN

Igual en las dos:

```sql
SELECT p.family_name, a.ward, COUNT(o.id) AS rondas
FROM admission a
JOIN patient p ON p.id = a.patient_id
LEFT JOIN observation o ON o.admission_id = a.id
WHERE a.discharged_at IS NULL
GROUP BY p.family_name, a.ward
ORDER BY rondas DESC;
```

MEDINA da `0`. Y ojo con un detalle: es `COUNT(o.id)`, no `COUNT(*)`. Con
`COUNT(*)` contás filas del resultado, y el `LEFT JOIN` deja una fila con
todo en `NULL` — te daría `1` en vez de `0`. `COUNT` de una columna ignora los
nulos.

## 3 — Concatenar

**PostgreSQL:**

```sql
SELECT family_name || ', ' || given_name AS nombre FROM patient;
```

**MySQL:**

```sql
SELECT CONCAT(family_name, ', ', given_name) AS nombre FROM patient;
```

Si corriste la versión con `||` en MySQL te devolvió una columna llena de
**ceros**, sin ningún error. Porque en MySQL `||` es el **OR lógico**: le
pediste `family_name OR ', ' OR given_name`, que evaluado como booleano da
falso, y falso se imprime como `0`.

`CONCAT` también funciona en PostgreSQL, así que si querés una sola forma que
ande en las dos, es esa.

## 4 — Comillas

**MySQL** acepta `WHERE sex = "female"` y devuelve a VERGARA.

**PostgreSQL** falla: `ERROR: column "female" does not exist`.

La regla, y es la más importante de todas:

| | PostgreSQL | MySQL |
| --- | --- | --- |
| `'texto'` | una cadena de texto | una cadena de texto |
| `"texto"` | **un identificador** (tabla, columna) | una cadena de texto |
| `` `texto` `` | no existe | un identificador |

Por eso en VitaLink las consultas crudas dicen `FROM "Admission"`: Prisma creó
las tablas con mayúscula inicial, y PostgreSQL pasa a minúscula todo
identificador que no esté entre comillas dobles. Sin las comillas buscaría
`admission`, no la encontraría, y diría *relation does not exist*.

**La costumbre que te ahorra el problema para siempre:** nombres de tabla y
columna en `minúscula_con_guion_bajo`, y comillas simples para el texto,
siempre. Así el mismo SQL anda en las dos.

## 5 — Mayúsculas al buscar

**PostgreSQL** — `LIKE` distingue mayúsculas, así que `'%medina%'` da cero
filas. Se resuelve con `ILIKE`:

```sql
SELECT family_name FROM patient WHERE family_name ILIKE '%medina%';
```

**MySQL** — `LIKE` ya no distingue, por el *collation* por defecto
(`utf8mb4_0900_ai_ci`: la `ci` es *case insensitive*). Encuentra a MEDINA sin
hacer nada.

La forma que anda en las dos es bajar los dos lados:

```sql
WHERE LOWER(family_name) LIKE LOWER('%medina%')
```

…con un costo: aplicar una función a la columna **impide usar el índice**, así
que el motor tiene que leer la tabla entera. En PostgreSQL, cuando importa, se
crea un índice sobre la expresión: `CREATE INDEX ... ON patient (LOWER(family_name))`.

## 6 — Contar dos cosas

**PostgreSQL:**

```sql
SELECT ward,
       COUNT(*) FILTER (WHERE discharged_at IS NULL) AS abiertas,
       COUNT(*) AS total
FROM admission
GROUP BY ward
ORDER BY ward;
```

**MySQL** — no existe `FILTER`, da error de sintaxis:

```sql
SELECT ward,
       SUM(CASE WHEN discharged_at IS NULL THEN 1 ELSE 0 END) AS abiertas,
       COUNT(*) AS total
FROM admission
GROUP BY ward
ORDER BY ward;
```

Las dos dan: cardiology 1 de 2, internal-medicine 3 de 3, surgery 2 de 3.

`FILTER` es del estándar SQL y PostgreSQL lo implementa; MySQL no. Esta misma
consulta, con `FILTER`, es la que devuelve los contadores del tablero de
VitaLink.

## 7 — El booleano

```sql
SELECT p.mrn, a.urgent
FROM admission a JOIN patient p ON p.id = a.patient_id
LIMIT 3;
```

PostgreSQL devuelve `t` y `f` (un tipo `boolean` de verdad). MySQL devuelve
`1` y `0`, porque `BOOLEAN` ahí es un alias de `TINYINT(1)`.

No es cosmético: si tu código hace `if (row.urgent === true)`, con MySQL nunca
entra, porque le llega el número `1`. Es la clase de bug que no rompe nada —
simplemente la condición nunca se cumple.

## 8 — La última observación de cada internación

**PostgreSQL, con LATERAL:**

```sql
SELECT p.family_name, a.ward, o.recorded_at, o.news2
FROM admission a
JOIN patient p ON p.id = a.patient_id
LEFT JOIN LATERAL (
  SELECT * FROM observation io
  WHERE io.admission_id = a.id
  ORDER BY io.recorded_at DESC
  LIMIT 1
) o ON TRUE
WHERE a.discharged_at IS NULL
ORDER BY o.news2 DESC NULLS LAST;
```

**MySQL, con función de ventana:**

```sql
WITH ranked AS (
  SELECT o.*,
         ROW_NUMBER() OVER (PARTITION BY o.admission_id
                            ORDER BY o.recorded_at DESC) AS rn
  FROM observation o
)
SELECT p.family_name, a.ward, r.recorded_at, r.news2
FROM admission a
JOIN patient p ON p.id = a.patient_id
LEFT JOIN ranked r ON r.admission_id = a.id AND r.rn = 1
WHERE a.discharged_at IS NULL
ORDER BY r.news2 IS NULL, r.news2 DESC;
```

Las dos dan lo mismo: OCASIO 10, ZAYAS 4, VERGARA 3, BORREGO 1, CARRERA 0, y
MEDINA con la fecha y el puntaje vacíos.

Tres cosas que vale la pena mirar de cerca:

**El `LEFT` importa.** Con `JOIN` a secas, MEDINA desaparece — y en un tablero
clínico, el paciente que nadie midió es el que menos puede desaparecer.

**`ON TRUE` no es un adorno.** Un `JOIN` exige una condición; el `LATERAL` ya
la lleva adentro (`io.admission_id = a.id`), así que afuera no queda nada que
poner.

**Los nulos al final.** PostgreSQL los pone primero al ordenar descendente, y
por eso está el `NULLS LAST`. MySQL no tiene esa cláusula: el truco es ordenar
primero por `r.news2 IS NULL`, que da 0 o 1 y empuja los nulos al fondo.

El índice `(admission_id, recorded_at DESC)` que está en los dos esquemas es lo
que hace barata esta consulta: el motor entra por internación y ya encuentra
las filas ordenadas, así que quedarse con la primera es una sola lectura.

En VitaLink medí las dos alternativas de PostgreSQL con 56.000 observaciones:
`LATERAL` le gana a `DISTINCT ON` por **2,9 veces**, y la diferencia crece con
la historia. Está en la ADR (Architecture Decision Record) 0010, con los
tiempos.

## 9 — Intervalos

**PostgreSQL** — la cantidad y la unidad van **adentro de comillas simples**:

```sql
SELECT count(*) AS ultimas_48h
FROM observation
WHERE recorded_at > TIMESTAMPTZ '2026-09-27 00:00:00+00' - INTERVAL '48 hours';
```

**MySQL** — la cantidad va suelta y la unidad es una palabra clave, en
singular:

```sql
SELECT count(*) AS ultimas_48h
FROM observation
WHERE recorded_at > '2026-09-27 00:00:00' - INTERVAL 48 HOUR;
```

Las dos dan 15. Si escribís `INTERVAL 48 HOUR` en PostgreSQL, es error de
sintaxis.

## 10 — El GROUP BY incompleto

No hay solución: hay que arreglar la pregunta. Si querés los diagnósticos por
sala, o los agrupás también:

```sql
SELECT ward, diagnosis, count(*) FROM admission GROUP BY ward, diagnosis;
```

…o los juntás en uno solo:

```sql
-- PostgreSQL
SELECT ward, string_agg(DISTINCT diagnosis, ' | ') AS diagnosticos, count(*)
FROM admission GROUP BY ward;

-- MySQL
SELECT ward, GROUP_CONCAT(DISTINCT diagnosis SEPARATOR ' | ') AS diagnosticos, count(*)
FROM admission GROUP BY ward;
```

---

## Lo que te llevás

| | PostgreSQL | MySQL |
| --- | --- | --- |
| Identificador | `"columna"` | `` `columna` `` |
| Texto | sólo `'texto'` | `'texto'` o `"texto"` |
| Autoincremental | `GENERATED ALWAYS AS IDENTITY` | `AUTO_INCREMENT` |
| Booleano | `boolean` (`t` / `f`) | `TINYINT(1)` (`1` / `0`) |
| Concatenar | `a \|\| b` | `CONCAT(a, b)` |
| Castear | `x::int` | `CAST(x AS SIGNED)` |
| Buscar sin mayúsculas | `ILIKE` | `LIKE` ya lo hace |
| Contar condicional | `COUNT(*) FILTER (WHERE ...)` | `SUM(CASE WHEN ... END)` |
| Última fila por grupo | `LEFT JOIN LATERAL` | `ROW_NUMBER() OVER (PARTITION BY ...)` |
| Intervalo | `INTERVAL '48 hours'` | `INTERVAL 48 HOUR` |
| Nulos al ordenar | `NULLS LAST` | `ORDER BY col IS NULL, col` |
| Instante con zona | `timestamptz` | `DATETIME` no la tiene |
| `COUNT` devuelve | `bigint` (rompe `JSON.stringify`) | un entero común |
| `INSERT ... RETURNING` | sí | MySQL 8 no |

Y la conclusión que importa más que la tabla: **no son dos lenguajes, son dos
dialectos.** Lo que sabías de MySQL no se tira; se ajusta en una docena de
lugares. Si en una entrevista podés nombrar tres de estas diferencias y decir
en qué te mordió cada una, estás muy por encima de "sé SQL".
