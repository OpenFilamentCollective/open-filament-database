import { goto } from '$app/navigation';

export async function realDelete(
  type: 'brand' | 'material' | 'filament' | 'instance' | 'store',
  id: string,
  brandId?: string,
  materialId?: string,
  filamentId?: string,
): Promise<boolean> {
  try {
    const response = await fetch('/api/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        id,
        brandId,
        materialId,
        filamentId,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(result.message);

      // Navigate to parent directory after successful deletion
      const currentPath = window.location.pathname;
      const pathSegments = currentPath.split('/').filter((segment) => segment !== '');
      pathSegments.pop(); // Remove the last segment
      const parentPath = pathSegments.length > 0 ? '/' + pathSegments.join('/') : '/';

      await goto(parentPath, { invalidateAll: true });
      return true;
    } else {
      console.error('Delete failed:', result.error);
      alert(`Delete failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error('Network error during delete:', error);
    alert('Network error occurred during deletion');
    return false;
  }
}
