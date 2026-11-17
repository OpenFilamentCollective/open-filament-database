export const STORAGE_KEY_CHANGES = 'ofd_pending_changes';
export const STORAGE_KEY_IMAGES_PREFIX = 'ofd_image_';
export const STORAGE_KEY_REOPEN_WIZARD = 'ofd_reopen_wizard';
export const STORAGE_KEY_THEME = 'ofd_theme';
export const STORAGE_KEY_USER_PREFS = 'ofd_user_prefs';
export const STORAGE_KEY_SUBMITTED = 'ofd_submitted_changes';
export const STORAGE_KEY_WELCOME_DISMISSED = 'ofd_welcome_dismissed';

/**
 * localStorage keys that hold user settings/preferences rather than working
 * data. These are preserved when "Clear local data" wipes everything else
 * (pending changes, cached images, submitted archive, clipboard, etc.).
 */
export const SETTINGS_STORAGE_KEYS: readonly string[] = [
	STORAGE_KEY_THEME,
	STORAGE_KEY_WELCOME_DISMISSED
];
