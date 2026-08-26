# 01 · Producto

## La tesis

De 28 gestores de recetas self-hosted revisados, **ninguno cierra el círculo
completo**. Mealie y Tandoor tienen recetas y plan pero no saben qué hay en la
nevera. Grocy sabe lo de la nevera pero las recetas son un añadido.

La ventaja de RezetApp es empezar de cero sabiendo eso: **recetas, despensa y plan
viven en la misma base de datos**, y el MCP los expone juntos. Eso convierte
"planifícame la semana" de un ejercicio de imaginación a una consulta real — el
modelo puede ver que hay media calabaza que caduca el jueves, que se cenaron
lentejas el lunes, y que el miércoles solo hay veinte minutos.

Lo segundo que nadie hace bien es el **escalado de cantidades honesto**. Todas
multiplican por dos y se quedan tan anchas.

## Las cinco pantallas

Regla heredada de openGym: *cinco pantallas, cero ruido*. Tiene 1.324 ejercicios
y aun así se navega con cinco. La contención es la decisión de diseño.

| Pantalla | Responde a | Contenido |
|---|---|---|
| **Hoy** | "¿Qué ceno?" sin tocar nada | Comida de hoy, anillo de calorías, lo que caduca, atajos |
| **Cocinar** | Estoy con la sartén al fuego | Un paso por pantalla, raciones, temporizadores, wake lock |
| **Plan** | La semana | Calendario arrastrar y soltar, sobras, propuestas de la IA |
| **Despensa** | Qué hay en casa | Inventario por ubicación, caducidades, descuento automático |
| **Recetas** | El archivo | Búsqueda, filtros, importación |

**Sin pestaña propia** (viven dentro de donde importan): nutrición, ajustes,
proveedores de IA, tiendas, miembros del hogar, importar y exportar.

Si una funcionalidad nueva parece pedir una sexta pestaña, casi seguro está mal
ubicada. Pregunta antes de añadirla.

## Qué NO construir

- **Lista de la compra.** Es ShopList. Ver `docs/06-SHOPLIST.md`.
- **Sincronización offline compleja.** La lista era lo único que se usa sin red, y
  ya no está aquí. No montes CRDTs.
- **Reparto de gastos, geovallas, pasillos de supermercado.** Todo eso es de ShopList.
- **Un motor de recomendación propio.** La recomendación la pone la IA a través
  del MCP. La app aporta los datos.
- **Red social, recetas públicas, comentarios.** Fuera de alcance.

## El bucle que hace útil todo el sistema

```
cocinas → la app descuenta de la despensa → la despensa cambia
lo que el agente puede sugerir la semana siguiente
```

Sin el descuento automático al marcar una comida como cocinada, la despensa se
desactualiza en tres días y el sistema entero deja de servir. Es la pieza que más
gente subestima y la que más hay que cuidar.

## Perfil de uso

- Dos adultos en un hogar, con posibilidad de más.
- Se publicará como open source self-hosted, así que la instalación tiene que ser
  un `docker compose up` sin configurar S3 ni SMTP.
- Móvil primero: se usa de pie, con una mano, a veces con las manos sucias.
