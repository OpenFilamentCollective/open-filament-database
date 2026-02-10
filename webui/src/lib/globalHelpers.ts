const illegal_characters = [
  "#","%","&","{","}","\\","<",
  ">","*","?","/","$","!","'",
  '"',":","@","+","`","|","="
];
// This should at all times be the same as /ofd/validation/validators.py ILLEGAL_CHARACTERS

export const stripOfIllegalChars = (input?: string | null, exceptions?: string[] | undefined): string => {
  // Defensive: coerce null/undefined to empty string
  let value = input == null ? '' : String(input);

  illegal_characters.forEach((char) => {
    if (exceptions && exceptions.includes(char)) {
      return;
    }
    // avoid using replaceAll to be robust across runtimes
    value = value.split(char).join('');
  })

  return value;
};

export const isEmpty = (obj: Object): boolean => {
  for (var prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      return false;
    }
  }

  Object.values(obj).filter((value) => {
    if (!value) {
      return false;
    }
  });
  
  return true
}

export const isEmptyObject = (value: any): boolean => {
  if (value == null) {
    // null or undefined
    return false;
  }

  if (typeof value !== 'object') {
    // boolean, number, string, function, etc.
    return false;
  }

  const proto = Object.getPrototypeOf(value);

  // consider `Object.create(null)`, commonly used as a safe map
  // before `Map` support, an empty object as well as `{}`
  if (proto !== null && proto !== Object.prototype) {
    return false;
  }

  return isEmpty(value);
}

export const isValidJSON = (jsonString: string): boolean => {
  try {
    JSON.parse(jsonString);
    return true;
  } catch (e) {
    return false;
  }
}

export const capitalizeFirstLetter = (val: string) => {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
};

export const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .filter(([_, v]) => v !== "null")
        .filter(([_, v]) => v !== null)
        .filter(([_, v]) => v?.length !== 0)
        .filter(([_, v]) => v)
        .map(([k, v]) => [k, removeUndefined(v)]),
    );
  }
  return obj;
};

export const getIdFromName = (name: string): string => {
  return stripOfIllegalChars(
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_'),
    ['+']
  );
};

export const getLogoName = (fileName: string): string => {
  let logoName = 'logo.' + fileName.split('.').pop();
  return logoName;
}
