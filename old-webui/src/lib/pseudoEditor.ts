type editType = 'brand' | 'material' | 'filament' | 'variant';
type editAction = 'modified' | 'deleted';
const storageKey = 'editedItems';

export interface EditedItem {
  type: editType;
  action: editAction;
  brandId: string;
  materialId?: string;
  filamentId?: string;
  colorId?: string;
  data: any;
  timestamp: number;
}

export const pseudoEdit = (
  type: editType,
  action : editAction,
  brandId: string,
  data: any,
  materialId?: string,
  filamentId?: string,
  colorId?: string,
) => {
  const existingItems = localStorage.getItem(storageKey);
  let editedItems: EditedItem[] = [];

  if (existingItems) {
    try {
      editedItems = JSON.parse(existingItems);
    } catch (error) {
      console.error('Error parsing edited items from localStorage:', error);
      editedItems = [];
    }
  }

  // Create unique identifier for the item
  const itemKey = createItemKey(type, action, brandId, materialId, filamentId, colorId);

  // Remove existing edit for this item if it exists
  editedItems = editedItems.filter(
    (item) =>
      createItemKey(
        item.type,
        item.action,
        item.brandId,
        item.materialId,
        item.filamentId,
        item.colorId,
      ) !== itemKey,
  );

  // Add new edit
  editedItems.push({
    type,
    action,
    brandId,
    materialId,
    filamentId,
    colorId,
    data,
    timestamp: Date.now(),
  });

  localStorage.setItem(storageKey, JSON.stringify(editedItems));
};

export const getEditItems = (
  type: editType,
  brandId?: string,
  materialId?: string,
  filamentId?: string,
  colorId?: string,
) => {
  if (typeof localStorage === 'undefined') return null;
  const existingItems = localStorage.getItem(storageKey);

  if (!existingItems) return null;

  try {
    const editedItems: EditedItem[] = JSON.parse(existingItems);

    if (type === "brand") {
      return editedItems.filter((value) => {
        return value.type === "brand" && value.action !== "deleted";
      });
    }
  } catch (error) {
    console.error('Error parsing edited items from localStorage:', error);
    return null;
  }
}

export const getEditedItem = (
  type: editType,
  action: editAction,
  brandId: string,
  materialId?: string,
  filamentId?: string,
  colorId?: string,
): any | null => {
  if (typeof localStorage === 'undefined') return null;

  const existingItems = localStorage.getItem(storageKey);

  if (!existingItems) return null;

  try {
    const editedItems: EditedItem[] = JSON.parse(existingItems);
    const itemKey = createItemKey(type, action, brandId, materialId, filamentId, colorId);

    const editedItem = editedItems.find(
      (item) =>
        createItemKey(
          item.type,
          item.action,
          item.brandId,
          item.materialId,
          item.filamentId,
          item.colorId,
        ) === itemKey,
    );

    return editedItem ? editedItem.data : null;
  } catch (error) {
    console.error('Error parsing edited items from localStorage:', error);
    return null;
  }
};

export const isItemEdited = (
  type: editType,
  action: editAction,
  brandId: string,
  materialId?: string,
  filamentId?: string,
  colorId?: string,
): boolean => {
  return getEditedItem(type, action, brandId, materialId, filamentId, colorId) !== null;
};

export const clearEditedItems = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('editedItems');
  }
};

export const getAllEditedItems = (): EditedItem[] => {
  if (typeof localStorage === 'undefined') return [];

  const storageKey = 'editedItems';
  const existingItems = localStorage.getItem(storageKey);

  if (!existingItems) return [];

  try {
    return JSON.parse(existingItems);
  } catch (error) {
    console.error('Error parsing edited items from localStorage:', error);
    return [];
  }
};

function createItemKey(
  type: editType,
  action: editAction,
  brandId: string,
  materialId?: string,
  filamentId?: string,
  colorId?: string,
): string {
  const parts = [type, action, brandId];
  if (materialId) parts.push(materialId);
  if (filamentId) parts.push(filamentId);
  if (colorId) parts.push(colorId);
  return parts.join('|');
}
