# Bot Connect Agenda API - Especificaciones Técnicas

## Versión: 3.0 (Enriquecida + Filtrado)

Este documento describe el punto de acceso para que bots externos (como ConectadoBot) consuman la agenda de Tierra Prometida.

### 1. Autenticación
Todas las peticiones deben incluir un encabezado de seguridad.
- **Header**: `x-api-key`
- **Valor**: (Configurado en `.env` de Render como `AGENDA_API_KEY`)

### 2. Endpoint Principal
`GET /api/v1/agenda`

#### Parámetros de Consulta (Opcionales)
| Parámetro | Tipo | Descripción |
| :--- | :--- | :--- |
| `month` | string | Nombre del mes (ej: `marzo`). Si se omite, usa el actual. |
| `week` | number | Número de semana (1 a 5). Filtra eventos por rangos predefinidos. |

#### Rangos de Semanas (Filtro por `dia`)
- **Semana 1**: Días 1-7
- **Semana 2**: Días 8-14
- **Semana 3**: Días 15-21
- **Semana 4**: Días 22-28
- **Semana 5**: Días 29-31

### 3. Formato de Respuesta (JSON)
```json
{
  "mes": "Marzo",
  "lema": "CRECER",
  "versiculo": "2 Pedro 3:18...",
  "imagenUrl": "https://midominio.com/images/03_MARZO.png",
  "eventos": [
    {
      "dia": 17,
      "nombre": "Inicio Entrenamiento Misionero",
      "hora": "1:00 pm",
      "lugar": "Auditorio Principal",
      "descripcion": "Inicia tu preparación..."
    }
  ]
}
```

### 4. Imágenes Estáticas
Las imágenes mensuales están disponibles públicamente en:
`https://[HOST]/images/[01-12]_[NOMBRE_MES].png`

### 5. CORS
El servidor está configurado para permitir peticiones desde cualquier origen (`*`) con los encabezados necesarios.
