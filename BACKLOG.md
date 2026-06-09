# Pending


# In Progress


# Done

- [x] Añade un numero de version junto al titulo. Version es YYYYMMDD (año mes dia sin espacios). El numero debe constar tambien en la imagen de docker

- [x] En las listas (tanto cerradas como abiertas) añade una flechita en las columnas Fecha y Activo, para hacer que la lista se pueda ordenar por esas columnas
- [x] En el desglose de lotes de compra, en todas las vistas (cerradas y abiertas) añade una columna "Cuenta" despues de la de la columna Activo, en ella se detalla el La cuenta origen de ese lote.

- [x] Añade Account Group como filtro en la barra lateral (selector "Grupo"), mutuamente exclusivo con el filtro de Cuenta
- [x] FIFO agrupado por Account Group: al vender un activo en una cuenta, se usan los lotes de todas las cuentas del mismo grupo para el cálculo FIFO

- [x] Añadir vista "Posiciones Abiertas" con toggle de vistas, tabla de lotes activos con splits/contrasplits/ampliaciones, y sus totales (acciones, precio medio, comisiones)
- [x] Revisar los filtros de cuenta y de activo, no funcionan. Solo funciona el filtro de Año

- [x] Hacer que los lotes bajo la fila de ventas sean deplegables individualmente,  por defecto aparecen colapsados
- [x] Ordenar alfabeticamente las listas de los filtros
- [x] Renombrar lo que se muestra como titulo de ventana en el navegador "Create Next App" por Wealthtaxes
- [x] Cabecera de la tabla en texto blanco fondo negro
- [x] Las columnas de la tabla deben ser las que siguen: Fecha, Activo (Usa symbol que contiene el mercado), cantidad, precio venta, total venta, comisiones, total venta+comisiones, coste en moneda original (incluyendo comisiones), beneficio/perdida en euros. Para las filas de clotes de compra igual orden
