import { forwardRef, useMemo, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import { TextField } from './Fields';
import { radius } from './tokens';
import type { Ingredient, Locale } from '../types';

/**
 * Campo de nombre de ingrediente con sugerencias: del catálogo del hogar (lo
 * que ya hay en la despensa o en otras recetas) y del catálogo global. Se usa
 * en "Añadir a despensa" y en las filas de ingredientes de una receta.
 */
export const IngredientNameField = forwardRef(function IngredientNameField(
  {
    value,
    onChange,
    onPick,
    placeholder,
    ingredients,
    locale,
    loc,
    style,
  }: {
    value: string;
    onChange: (v: string) => void;
    /** Se dispara al elegir una sugerencia — trae el ingrediente completo (para tomar su unidad por defecto, etc.). */
    onPick?: (ingredient: Ingredient) => void;
    placeholder?: string;
    ingredients: Ingredient[];
    locale: Locale;
    loc: (v: Ingredient['name']) => string;
    style?: CSSProperties;
  },
  ref: Ref<HTMLInputElement>,
) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return ingredients.filter((i) => loc(i.name).toLowerCase().includes(q)).slice(0, 6);
  }, [ingredients, value, loc, locale]);

  return (
    <div style={{ position: 'relative' }}>
      <TextField
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={style}
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 5,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: radius.input,
            boxShadow: 'var(--shadow-m)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((ing) => (
            <button
              key={ing.id}
              type="button"
              onClick={() => {
                onChange(loc(ing.name));
                onPick?.(ing);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                fontSize: 15,
                border: 0,
                background: 'transparent',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              {loc(ing.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
