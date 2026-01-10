export async function realEdit(
  type: 'brand' | 'material' | 'filament' | 'color_variant' | 'color_size',
  brandName: string,
  data: any,
  materialName?: string,
  filamentName?: string,
  colorName?: string,
): Promise<boolean> {
  try {
    let response: Response;

    switch (type) {
      case 'brand':
        response = await fetch('/api/edit/brand', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName, data }),
        });
        break;

      case 'material':
        response = await fetch('/api/edit/material', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName, materialName, data }),
        });
        break;

      case 'filament':
        response = await fetch('/api/edit/filament', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName, materialName, filamentName, data }),
        });
        break;

      case 'color_variant':
        response = await fetch('/api/edit/color-variant', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName, materialName, filamentName, colorName, data }),
        });
        break;

      case 'color_size':
        response = await fetch('/api/edit/color-size', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName, materialName, filamentName, colorName, data }),
        });
        break;

      default:
        throw new Error(`Unsupported edit type: ${type}`);
    }

    const result = await response.json();

    if (response.ok) {
      console.log(result.message);
      return true;
    }
    console.error('Edit failed:', result.error);
    alert(`Edit failed: ${result.error}`);
    return false;
  } catch (error) {
    console.error('Network error during edit:', error);
    alert('Network error occurred during edit');
    return false;
  }
}
