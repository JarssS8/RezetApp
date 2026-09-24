# Changelog

Versiones publicadas de Rezet. Cada entrada, en español y en inglés.
Published Rezet versions. Every entry in Spanish and English.

## [1.12.1] - 2026-09-24

### Español

**Arreglado**
- Los interruptores de encendido y apagado (Avisos, Tu hogar y Personalizar Hoy) se veían con un cerco gris alrededor de la bolita y cambiaban de golpe en vez de deslizarse. Ahora se mueven como deben y se ve dónde está el foco al navegar con el teclado.
- Las horas de silencio se salían de su tarjeta en pantallas estrechas: cuando no caben una al lado de la otra, ahora se colocan una debajo de la otra.
- En tema oscuro, el relojito para elegir la hora de silencio era negro sobre fondo oscuro y no se veía.

### English

**Fixed**
- The on/off switches (Notifications, Your household and Customize Today) had a grey halo around the knob and snapped instead of sliding. They now move as they should, and the focus ring is visible when navigating by keyboard.
- The quiet hours overflowed their card on narrow screens: when the two fields don't fit side by side, they now stack.
- In dark mode, the little clock for picking a quiet hour was black on a dark background and invisible.

## [1.12.0] - 2026-09-23

### Español

**Nuevo**
- Cuatro bloques nuevos en Hoy: "Registro rápido" (registrar lo que has comido sin salir de la pantalla), "Caduca pronto" (lo próximo a vencer en la despensa), "Para la semana" (lo que falta comprar) y "A quién le toca" (turnos de cocinar/comprar de hoy).
- Hoy se personaliza: cada persona elige qué bloques ve, en qué orden y con qué tamaño, y esa configuración le sigue a cualquier dispositivo en el que entre.
- Se puede apagar cualquier bloque de Hoy, incluido el anillo de calorías, y se queda apagado hasta que decidas volver a encenderlo.
- El bloque "a quién le toca" solo aparece cuando los turnos del hogar están encendidos; se apaga solo si los turnos se apagan.
- El orden se cambia arrastrando las filas de la hoja "Personalizar Hoy" o con los botones de subir y bajar, para quien prefiera no arrastrar.

### English

**New**
- Four new blocks on Today: "Quick log" (log what you've eaten without leaving the screen), "Expiring soon" (what's about to go off in the pantry), "For the week" (what's still missing from the shopping list) and "Whose turn" (today's cooking/shopping shifts).
- Today is now personal: everyone picks which blocks they see, in what order and at what size, and that choice follows them to any device they sign in on.
- Any block on Today can be turned off, including the calorie ring, and it stays off until you turn it back on.
- The "whose turn" block only shows up when the household's shifts are turned on, and disappears on its own if shifts get turned off.
- Reorder blocks by dragging the rows in the "Customize Today" sheet, or with the up/down buttons, for anyone who'd rather not drag.

## [1.11.0] - 2026-09-23

### Español

**Nuevo**
- Avisos a tu medida: cada persona elige qué le notifica la app (temporizadores de cocina, caduca pronto, te toca cocinar, recordatorio de registrar lo que comes) y puede fijar unas horas de silencio. Los de la mañana llegan a partir de las 9; el recordatorio, a tu hora. Los temporizadores de cocina nunca se silencian, ni siquiera en esas horas: uno que se traga porque son las 23:10 es comida quemada, no una molestia.
- Gustos: cada miembro marca si una receta le gusta o no le gusta, y el hogar ve el agregado ("gusta a 3 de 4") al decidir qué cocinar. Quién ha votado qué es visible dentro del hogar, a propósito.
- "Para ti" en Hoy: un bloque que sugiere recetas según tus gustos, lo que da la despensa y lo que no has cocinado últimamente.
- Turnos: un hogar puede repartirse quién cocina cada comida y quién hace la compra de la semana. Vienen apagados, los enciende cualquier miembro del hogar, y son puramente informativos: no cambian la despensa, la compra ni las calorías.

### English

**New**
- Notifications your way: everyone chooses what the app notifies them about (cooking timers, expiring soon, your turn to cook, a reminder to log what you ate) and can set quiet hours. The morning ones arrive from 9am; the reminder, at your chosen time. Cooking timers never go quiet, not even during those hours: one that gets swallowed because it's 11:10pm is burnt food, not a nuisance.
- Likes: every member marks whether they like a recipe or not, and the household sees the aggregate ("3 of 4 like it") when deciding what to cook. Who voted what is visible inside the household, on purpose.
- "For you" on Today: a block that suggests recipes based on your likes, what the pantry has, and what you haven't cooked lately.
- Shifts: a household can split up who cooks each meal and who does the week's shopping. They come turned off, any household member can turn them on, and they're purely informational — they don't change the pantry, the shopping list or calories.

## [1.10.0] - 2026-09-21

### Español

**Nuevo**
- Cada persona tiene su objetivo de calorías, estimado a partir de sexo, edad, altura, peso y actividad. Es una estimación: siempre se puede escribir el número a mano, y donde la fórmula no está validada (sin sexo declarado, o con menos de 18 años) no se ofrece — se pide el número directamente.
- El anillo de Hoy ya cuenta lo que has comido **tú**: las comidas del plan que se han cocinado, a una ración por persona (ajustable a ½, 1, 1½ o 2, o descartable), más lo que registres aparte.
- Registrar lo que comes por cuatro caminos: lo que más repites, texto libre, una receta del hogar, o escaneando un código de barras.
- Al terminar de cocinar, la comida se reparte entre quienes la comieron.
- "Tu semana": las barras de cada día, la media y la racha de días dentro del objetivo.
- Los datos corporales son privados: no los ve el resto del hogar, y desaparecen si te vas. Lo que sí es visible dentro del hogar son las raciones de una comida compartida (quien cocinó estaba delante) y el objetivo de calorías de cada persona (hace falta para planificar).

**Cambio de comportamiento**
- Antes, el anillo de Hoy sumaba las raciones del plato entero: una cena de 4 raciones contaba como 4 para quien mirase la pantalla. Ahora suma **tu** ración. En un hogar que planifica varias raciones, el número **baja**. No es un fallo: antes contaba mal.

### English

**New**
- Everyone gets their own calorie target, estimated from sex, age, height, weight and activity level. It's an estimate: you can always type your own number by hand, and where the formula isn't validated (no sex on file, or under 18) it isn't offered at all — you're asked for the number directly instead.
- The Today ring now counts what **you** ate: cooked plan meals, at one serving per person (adjustable to ½, 1, 1½ or 2, or dismissable), plus anything you log separately.
- Log what you eat four ways: your most-repeated pick, free text, a household recipe, or scanning a barcode.
- Finishing a cook now splits the meal between whoever ate it.
- "Your week": daily bars, the average, and your streak of days within target.
- Body data is private: no one else in the household can see it, and it disappears if you leave. What *is* visible inside the household is a shared meal's servings (whoever cooked was there) and everyone's calorie target (planning needs it).

**Behaviour change**
- The Today ring used to add up the whole dish's servings: a 4-serving dinner counted as 4 for anyone looking at the screen. It now adds up **your** serving instead. In a household that plans multiple servings, the number **goes down**. That's not a bug — it used to count wrong.

## [1.9.0] - 2026-09-20

### Español

**Nuevo**
- Miembros del hogar: cada persona tiene su propio nombre, color, avatar y objetivo de calorías.
- Se pueden añadir personas sin cuenta (niños, invitados); sus datos los ven todas las personas con cuenta del hogar.
- Los ajustes (tema, idioma, acento, unidades) se guardan ya en la cuenta y te siguen entre dispositivos.

**Cambio de comportamiento**
- Como consecuencia de lo anterior, el asistente conectado por MCP responde ahora en el idioma que tengas puesto en la app. Antes contestaba siempre en español, porque el idioma nunca llegaba a guardarse en la cuenta aunque el MCP sí lo leía.
- El anillo de Hoy ya se compara contra tu propio objetivo de calorías, no el del hogar. Lo que cuenta como consumido sigue siendo el total de las comidas de todo el hogar; repartir ese consumo entre personas llega en una versión posterior.

### English

**New**
- Household members: everyone gets their own name, colour, avatar and calorie target.
- You can now add people without an account (kids, guests); their data is visible to every account holder in the household.
- Settings (theme, language, accent, units) are now saved to the account and follow you across devices.

**Behaviour change**
- As a consequence of the above, the assistant connected via MCP now replies in whatever language you have set in the app. It used to always answer in Spanish, because the language was never actually saved to the account even though MCP did read it.
- The Today ring now compares against your own calorie target, not the household's. What counts as eaten is still the total across every meal in the household; splitting that total per person comes in a later version.

## [1.8.2] - 2026-09-20

### Español

**Mejorado**
- La pantalla que da permiso a tu asistente de IA ahora tiene el aspecto de Rezet: mismo logo, mismos colores y modo oscuro automático.
- Esa pantalla habla tu idioma: sale en español o en inglés según el idioma del navegador.

### English

**Improved**
- The screen that grants your AI assistant access now looks like Rezet: same logo, same colours, automatic dark mode.
- That screen speaks your language: it shows in Spanish or English depending on your browser's language.

## [1.8.1] - 2026-09-19

### Español

**Arreglado**
- Al añadir a la Despensa con el código de barras o con Foto, el nombre del producto llega limpio: sin saltos de línea ni caracteres invisibles, y nunca más largo de 120 caracteres.
- Al conectar tu asistente de IA, la pantalla de permiso ya no puede mostrar el nombre de una aplicación desmesuradamente largo.
- Comprobaciones de seguridad más estrictas en los avisos de temporizador.

### English

**Fixed**
- When you add to the Pantry by barcode or with Photo, the product name comes in clean: no line breaks or invisible characters, and never longer than 120 characters.
- When you connect your AI assistant, the permission screen can no longer show an absurdly long app name.
- Stricter security checks on timer notifications.

## [1.8.0] - 2026-09-19

### Español

**Nuevo**
- En Cuenta y hogar puedes cerrar sesión en todos tus dispositivos a la vez. También desconecta a tu asistente de IA: es la forma de quitarle el acceso a tu hogar.
- Si administras el hogar, puedes quitar a alguien del hogar y quitarle el rol de administrador a otra persona desde Tu hogar.

**Arreglado**
- La hoja de conectar tu asistente de IA ya no dice que basta con cerrar sesión para quitarle el acceso.
- Una invitación deja de servir si quien la creó ya no administra el hogar.
- Las fotos de recetas de otros hogares ya no pueden quedarse guardadas indefinidamente, y la limpieza diaria de fotos ya no puede borrar por error las que siguen en uso.
- El límite diario de reconocimiento de fotos en la Despensa ya no se reinicia al salir del hogar o volver a crearlo.
- Varias comprobaciones de seguridad más estrictas entre hogares.

### English

**New**
- In Account & household you can sign out on all your devices at once. It also disconnects your AI assistant: that's how you remove its access to your household.
- If you run the household, you can remove someone from it and take the admin role away from another member in Your household.

**Fixed**
- The sheet for connecting your AI assistant no longer says that signing out is enough to remove its access.
- An invite stops working when whoever created it no longer runs the household.
- Recipe photos from other households can no longer be kept around indefinitely, and the daily photo cleanup can no longer delete photos that are still in use by mistake.
- The daily limit for photo recognition in the Pantry no longer resets when you leave the household or create it again.
- Several stricter security checks between households.

## [1.7.3] - 2026-09-18

### Español

**Importante**
- Si tienes la aplicación instalada desde hace tiempo y no la has actualizado, el botón de invitar puede dejar de responder. Abre Rezet, acepta la actualización que te ofrece y volverá a funcionar.

**Mejorado**
- Los códigos de invitación solo pueden nacer desde la propia aplicación y con la caducidad de siete días: ya no hay ninguna otra forma de crear uno.

### English

**Important**
- If you have had the app installed for a while without updating it, the invite button may stop responding. Open Rezet, accept the update it offers, and it will work again.

**Improved**
- Invite codes can only be created from the app itself, with the seven-day expiry: there is no longer any other way to create one.

## [1.7.2] - 2026-09-18

### Español

**Mejorado**
- Tu asistente de IA recibe ahora mensajes de error claros (por ejemplo, que una receta no existe o que tiene que volver a iniciar sesión), en vez de un error sin sentido.
- Solo los administradores del hogar pueden ver los códigos de invitación pendientes, y al generar uno nuevo se avisa de que anula el anterior.
- Al conectar tu asistente de IA, la pantalla de permiso avisa mejor cuando la aplicación que lo pide no es de confianza.

**Arreglado**
- Borrar algo de la despensa, del plan o una receta se refleja al momento en los demás dispositivos del hogar.
- La regla de que solo los administradores invitan se cumple también desde versiones antiguas de la app.
- Cerrar sesión ya no se queda colgado en algunos navegadores.
- Si falla el borrado de una receta, ya no se pierde su foto.
- Las fotos de recetas con nombres de archivo poco habituales se guardan correctamente.

### English

**Improved**
- Your AI assistant now gets clear error messages (for example, that a recipe doesn't exist or that it needs to sign in again) instead of a meaningless error.
- Only household admins can see pending invitation codes, and generating a new one now warns that it cancels the previous one.
- When connecting your AI assistant, the permission screen now warns more reliably when the app asking isn't trusted.

**Fixed**
- Deleting something from the pantry, the plan or a recipe now shows up immediately on the household's other devices.
- The rule that only admins can invite now also holds for older versions of the app.
- Signing out no longer hangs in some browsers.
- If deleting a recipe fails, its photo is no longer lost.
- Recipe photos with unusual file names are now saved correctly.

## [1.7.1] - 2026-09-18

### Español

**Arreglado**
- Cerrar sesión ya solo te saca del dispositivo en el que lo haces; antes te sacaba también de los demás, incluido tu asistente de IA.
- Cerrar sesión en un dispositivo ya no cancela un temporizador que tengas en marcha en otro.
- Al exportar la lista de la compra a komprapp, lo que se cuenta por unidades llega como "ud" y no como "paq".

### English

**Fixed**
- Signing out now only signs you out of the device you're using; before, it also signed you out of your other devices, including your AI assistant.
- Signing out on one device no longer cancels a timer you have running on another.
- When exporting the shopping list to komprapp, items counted by unit now arrive as "ud" instead of "paq".

## [1.7.0] - 2026-09-18

### Español

**Importante**
- Invitar a alguien a tu hogar pasa a ser cosa solo de los administradores.
- Al crear una invitación nueva, cualquier invitación anterior sin usar caduca automáticamente.

**Nuevo**
- Los administradores pueden ver las invitaciones pendientes del hogar y anularlas antes de que se usen.
- Las fotos de recetas que ya no se usan se limpian automáticamente.

**Mejorado**
- Límites más estrictos en el servidor para los avisos de temporizador y el reconocimiento de productos por foto.
- Cabeceras de seguridad añadidas para proteger la app frente a contenido no autorizado.

### English

**Important**
- Inviting someone to your household is now limited to household admins.
- Creating a new invitation automatically expires any previous unused one.

**New**
- Admins can see the household's pending invitations and cancel them before they're used.
- Recipe photos that are no longer used are cleaned up automatically.

**Improved**
- Stricter server-side limits for timer notifications and photo-based pantry recognition.
- Security headers added to protect the app against unauthorized content.

## [1.6.0] - 2026-09-18

### Español

**Importante**
- Las invitaciones a un hogar pendientes de antes de esta versión han caducado; si necesitas invitar a alguien, genera un código nuevo.

**Nuevo**
- Los códigos de invitación a un hogar ahora los genera el servidor y caducan a los 7 días; si quien los creó sale del hogar, dejan de funcionar.

**Mejorado**
- Reforzado el control de acceso al entrar en un hogar, para que solo pueda hacerlo quien corresponde.
- Las fotos de tus recetas ya no se pueden ver ni listar desde fuera de tu hogar, y se borran junto con la receta.
- Añadidos límites y comprobaciones en el servidor para los avisos de temporizador y el reconocimiento de productos por foto, para que sigan funcionando de forma fiable.

### English

**Important**
- Household invitations pending from before this version have expired; generate a new code if you need to invite someone.

**New**
- Household invite codes are now generated by the server and expire after 7 days; they stop working if whoever created them leaves the household.

**Improved**
- Strengthened access control when joining a household, so only the right person can get in.
- Your recipe photos can no longer be viewed or listed from outside your household, and are deleted along with the recipe.
- Added server-side limits and checks for timer notifications and photo-based pantry recognition, so they keep working reliably.

## [1.5.1] - 2026-09-17

### Español

**Mejorado**
- "Importar/Compartir a komprapp" ahora es el botón principal de la lista de la compra y manda todo lo que falta con un solo toque, sin tener que marcar nada — "Pasar a la despensa" sigue funcionando igual, con su propia selección.

**Arreglado**
- El botón "Vincular" de komprapp ya no se queda bloqueado para quien sí es administrador del hogar.

### English

**Improved**
- "Import/Share to komprapp" is now the main button in the shopping list and sends everything missing with one tap, no checking required — "Move to pantry" still works the same, with its own selection.

**Fixed**
- The "Link" button for komprapp no longer stays stuck for someone who is actually a household admin.

## [1.5.0] - 2026-09-17

### Español

**Nuevo**
- Botón "Compartir con komprapp" en la lista de la compra: copia un enlace con los productos marcados para importarlos en la app komprapp.
- En Ajustes → Cuenta y hogar, un administrador puede vincular una lista de komprapp al hogar. Una vez vinculada, cualquier persona del hogar puede importar la lista de la compra con un toque, sin enlaces ni pasos extra.

**Mejorado**
- Si vincular o importar a komprapp falla, ahora se avisa con un mensaje claro en vez de no pasar nada.

### English

**New**
- "Share with komprapp" button in the shopping list: copies a link with the checked items to import into the komprapp app.
- In Settings → Account & household, an admin can link a komprapp list to the household. Once linked, anyone in the household can import the shopping list with one tap, no links or extra steps.

**Improved**
- If linking or importing to komprapp fails, you now get a clear message instead of nothing happening.

## [1.4.0] - 2026-09-16

### Español

**Nuevo**
- Ideas ahora carga por tandas con un botón "Ver más", en vez de las 722 de golpe.

**Mejorado**
- Las fotos de Ideas cargan mucho más rápido, sobre todo en el móvil.

### English

**New**
- Ideas now loads in batches with a "Show more" button, instead of all 722 at once.

**Improved**
- Ideas photos load much faster, especially on mobile.

## [1.3.1] - 2026-09-15

### Español

**Mejorado**
- Guardar una idea ya no cambia de pantalla: avisa con un mensaje y el botón pasa a "Receta guardada", con el que puedes quitarla otra vez.

**Arreglado**
- El botón de eliminar receta ya funciona siempre, también tras hacer scroll en Editar.
- Eliminar receta ya no aparece como si fuera parte de "Más detalles".
- Algunas fotos de ideas no se guardaban por pesar demasiado; ahora se admiten fotos más grandes.

### English

**Improved**
- Saving an idea no longer switches screens: it shows a confirmation and the button becomes "Recipe saved", which you can tap again to remove it.

**Fixed**
- The delete-recipe button now always works, including after scrolling in Edit.
- Delete recipe no longer looks like part of "More details".
- Some idea photos failed to save for being too large; bigger photos are now accepted.

## [1.3.0] - 2026-09-15

### Español

**Nuevo**
- Ahora puedes eliminar una receta que ya no quieras, desde Editar.

**Mejorado**
- Mejor comportamiento con transparencia reducida o alto contraste activados en el sistema.
- Quitar un producto de la despensa pide confirmación, para no borrarlo sin querer.

**Arreglado**
- Al guardar una idea como receta propia, ahora se guarda también su foto.
- Las fotos de ideas que no llegan a cargar ya no se ven como una imagen rota.
- En el detalle de una idea, el botón de Guardar se queda fijo abajo también al hacer scroll.
- Guardar una idea o una receta ya no cambia de pantalla de golpe.
- "Actualizar" ya no se queda colgado si la app tarda en tomar la versión nueva.

### English

**New**
- You can now delete a recipe you no longer want, from Edit.

**Improved**
- Better behaviour with reduced transparency or increased contrast enabled at the system level.
- Removing a pantry item now asks for confirmation, so it's not deleted by mistake.

**Fixed**
- Saving an idea as your own recipe now also saves its photo.
- Idea photos that fail to load no longer show as a broken image.
- In an idea's detail, the Save button now stays put at the bottom while scrolling too.
- Saving an idea or a recipe no longer cuts to the next screen abruptly.
- "Update" no longer gets stuck if the app takes a moment to switch to the new version.

## [1.2.0] - 2026-09-15

### Español

**Nuevo**
- Nueva pestaña Ideas dentro de Recetas: más de 700 recetas de Cecofry y Olla GM que puedes explorar, filtrar por tiempo y aparato, y guardar en tus recetas con un toque. Se puede ocultar desde Ajustes.
- Al ver una idea, se compara con lo que ya tienes en la despensa, igual que con tus propias recetas.
- Al crear o editar una receta, un ingrediente puede marcarse "Al gusto" (sal, especias...) en vez de pedirle una cantidad. No aparece en la lista de la compra ni se descuenta de la despensa.

### English

**New**
- New Ideas tab inside Recipes: over 700 Cecofry and Olla GM recipes you can browse, filter by time and appliance, and save to your own recipes with one tap. Can be hidden from Settings.
- Viewing an idea checks it against what you already have in your pantry, just like your own recipes.
- When creating or editing a recipe, an ingredient can be marked "To taste" (salt, spices...) instead of asking for an amount. It's left off the shopping list and isn't subtracted from your pantry.

## [1.1.0] - 2026-09-15

### Español

**Nuevo**
- Cuando hay una versión nueva de Rezet, la app te avisa y se actualiza al tocar "Actualizar". Nunca te interrumpe mientras cocinas.
- Ajustes muestra la versión de Rezet que tienes.

**Arreglado**
- La app instalada en el móvil ya no se queda con la versión anterior hasta cerrarla del todo.

### English

**New**
- When a new version of Rezet is out, the app lets you know and updates when you tap "Update". It never interrupts you while you're cooking.
- Settings shows which version of Rezet you have.

**Fixed**
- The app installed on your phone no longer stays on the previous version until you close it completely.

## [1.0.0] - 2026-09-15

### Español

**Nuevo**
- Plan semanal: arrastra recetas a los huecos de la semana y ve las calorías de cada día.
- Lista de la compra que descuenta lo que ya tienes en la despensa.
- Despensa que se actualiza sola al cocinar.
- Modo Cocinar paso a paso, con temporizadores que siguen aunque bloquees el móvil y te avisan al terminar.
- Hogares compartidos: invita a tu familia con un código y nombra a varios administradores.
- Añade productos a la despensa escaneando el código de barras o con una foto del envase.
- Conecta tu asistente de IA a tu hogar para planificar y consultar recetas.
- En español e inglés, con modo oscuro y colores a elegir.

### English

**New**
- Weekly plan: drag recipes into the week's slots and see each day's calories.
- A shopping list that subtracts what's already in your pantry.
- A pantry that updates itself when you cook.
- Step-by-step Cook mode, with timers that keep running when your phone locks and alert you when they're done.
- Shared households: invite your family with a code and make several admins.
- Add pantry items by scanning a barcode or taking a photo of the package.
- Connect your AI assistant to your household to plan and look up recipes.
- In Spanish and English, with dark mode and a choice of colours.
