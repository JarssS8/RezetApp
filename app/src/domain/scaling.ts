/**
 * Escalado de cantidades por raciones.
 *
 * Los ingredientes sensibles (sal, especias, levadura) NO escalan linealmente:
 * doblar la sal arruina el plato. El exponente 0.55 no es negociable ni
 * ajustable por receta, y esta función es la única que lo aplica: la usan el
 * detalle de receta, el modo cocinar, la lista de la compra y el descuento de
 * despensa. Cuatro pantallas, un solo cálculo.
 */
export function scaleQuantity(
  baseQuantity: number,
  baseServings: number,
  servings: number,
  sensitive: boolean,
): number {
  if (baseServings <= 0) return baseQuantity;
  const factor = servings / baseServings;
  return sensitive ? baseQuantity * Math.pow(factor, 0.55) : baseQuantity * factor;
}
