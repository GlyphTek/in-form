-- Where the user wants local topics to come from. NULL means "never chosen";
-- the setup screen then suggests a region guessed from the browser.
ALTER TABLE users ADD COLUMN region_scope TEXT;
ALTER TABLE users ADD COLUMN region_area TEXT;
