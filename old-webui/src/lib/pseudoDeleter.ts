export interface DeletedItem {
  type: 'brand' | 'material' | 'filament' | 'instance';
  id: string;
  brandId?: string;
  materialId?: string;
  filamentId?: string;
}

export const pseudoDelete = (
  type: 'brand' | 'material' | 'filament' | 'instance' | 'store',
  id: string,
  brandId?: string,
  materialId?: string,
  filamentId?: string,
) => {
  const storageKey = 'deletedItems';
  const existingItems = localStorage.getItem(storageKey);
  let deletedItems: DeletedItem[] = [];

  if (existingItems) {
    try {
      deletedItems = JSON.parse(existingItems);
    } catch (error) {
      console.error('Error parsing deleted items from localStorage:', error);
      deletedItems = [];
    }
  }

  // Create item keys that are brand-specific for materials, filaments, and instances
  const itemKey =
    type === 'brand'
      ? `${type}|${id}`
      : type === 'material'
      ? `${type}|${brandId}|${id}`
      : type === 'filament'
      ? `${type}|${brandId}|${materialId}|${id}`
      : `${type}|${brandId}|${materialId}|${filamentId}|${id}`;

  const itemExists = deletedItems.some((item) => {
    const existingKey =
      item.type === 'brand'
        ? `${item.type}|${item.id}`
        : item.type === 'material'
        ? `${item.type}|${item.brandId}|${item.id}`
        : item.type === 'filament'
        ? `${item.type}|${item.brandId}|${item.materialId}|${item.id}`
        : `${item.type}|${item.brandId}|${item.materialId}|${item.filamentId}|${item.id}`;
    return existingKey === itemKey;
  });

  if (!itemExists) {
    const newItem: DeletedItem = {
      type,
      id,
      brandId: type !== 'brand' ? brandId : undefined,
      materialId: type === 'filament' || type === 'instance' ? materialId : undefined,
      filamentId: type === 'instance' ? filamentId : undefined,
    };

    deletedItems.push(newItem);
    localStorage.setItem(storageKey, JSON.stringify(deletedItems));

    // Navigate to parent page
    const currentPath = window.location.pathname;
    const pathSegments = currentPath.split('/').filter((segment) => segment !== '');
    pathSegments.pop(); // Remove the current item
    const parentPath = pathSegments.length > 0 ? '/' + pathSegments.join('/') : '/';

    window.location.href = parentPath;
  }
};

export const pseudoUndoDelete = (
  type: 'brand' | 'material' | 'filament' | 'instance',
  id: string
) => {
  if (typeof localStorage === 'undefined') return true;

  const storageKey = 'deletedItems';
  const existingItems = localStorage.getItem(storageKey);

  if (!existingItems) return true;

  let deletedItems: DeletedItem[] = [];

  if (existingItems) {
    try {
      deletedItems = JSON.parse(existingItems);
    } catch (error) {
      console.error('Error parsing deleted items from localStorage:', error);
      // return true; // We assume the key cannot exist in this case
    }
  }

  deletedItems = deletedItems.filter((item) => {
    return !( // Return false on match
      item.type == type &&
      item.id == id
    )
  });

  localStorage.setItem(storageKey, JSON.stringify(deletedItems));

  return true;
}

export const isItemDeleted = (
  type: 'brand' | 'material' | 'filament' | 'instance',
  id: string,
  brandId?: string,
  materialId?: string,
  filamentId?: string,
): boolean => {
  if (typeof localStorage === 'undefined') return false;

  const storageKey = 'deletedItems';
  const existingItems = localStorage.getItem(storageKey);

  if (!existingItems) return false;

  try {
    const deletedItems: DeletedItem[] = JSON.parse(existingItems);

    return deletedItems.some((item) => {
      if (item.type !== type || item.id !== id) return false;

      switch (type) {
        case 'brand':
          return true;
        case 'material':
          return item.brandId === brandId;
        case 'filament':
          return item.brandId === brandId && item.materialId === materialId;
        case 'instance':
          return (
            item.brandId === brandId &&
            item.materialId === materialId &&
            item.filamentId === filamentId
          );
        default:
          return false;
      }
    });
  } catch (error) {
    console.error('Error parsing deleted items from localStorage:', error);
    return false;
  }
};
