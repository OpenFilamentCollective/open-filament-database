type editType = 'brand' | 'material' | 'filament' | 'variant';
type editAction = 'modified' | 'deleted';
const storageKey = 'editedItems';

export interface EditedItem {
  type: editType;
  action: editAction;
  brandName: string;
  materialName?: string;
  filamentName?: string;
  colorName?: string;
  data: any;
  timestamp: number;
}

export const pseudoEdit = (
  type: editType,
  action : editAction,
  brandName: string,
  data: any,
  materialName?: string,
  filamentName?: string,
  colorName?: string,
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
  const itemKey = createItemKey(type, action, brandName, materialName, filamentName, colorName);

  // Remove existing edit for this item if it exists
  editedItems = editedItems.filter(
    (item) =>
      createItemKey(
        item.type,
        item.action,
        item.brandName,
        item.materialName,
        item.filamentName,
        item.colorName,
      ) !== itemKey,
  );

  // Add new edit
  editedItems.push({
    type,
    action,
    brandName,
    materialName,
    filamentName,
    colorName,
    data,
    timestamp: Date.now(),
  });

  localStorage.setItem(storageKey, JSON.stringify(editedItems));
};

export const getEditItems = (
  type: editType,
  brandName?: string,
  materialName?: string,
  filamentName?: string,
  colorName?: string,
) => {
  if (typeof localStorage === 'undefined' || !localStorage.getItem) return null;
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
  brandName: string,
  materialName?: string,
  filamentName?: string,
  colorName?: string,
): any | null => {
  if (typeof localStorage === 'undefined') return null;

  const existingItems = localStorage.getItem(storageKey);

  if (!existingItems) return null;

  try {
    const editedItems: EditedItem[] = JSON.parse(existingItems);
    const itemKey = createItemKey(type, action, brandName, materialName, filamentName, colorName);

    const editedItem = editedItems.find(
      (item) =>
        createItemKey(
          item.type,
          item.action,
          item.brandName,
          item.materialName,
          item.filamentName,
          item.colorName,
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
  brandName: string,
  materialName?: string,
  filamentName?: string,
  colorName?: string,
): boolean => {
  return getEditedItem(type, action, brandName, materialName, filamentName, colorName) !== null;
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
  brandName: string,
  materialName?: string,
  filamentName?: string,
  colorName?: string,
): string {
  const parts = [type, action, brandName];
  if (materialName) parts.push(materialName);
  if (filamentName) parts.push(filamentName);
  if (colorName) parts.push(colorName);
  return parts.join('|');
}
