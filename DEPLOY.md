# Free online setup

## 1. Create Supabase project

1. Create a project at https://supabase.com.
2. Open **SQL Editor** and run `supabase-schema.sql`.
3. Open **Project Settings > API**.
4. Copy the project URL and the `anon` public key into `supabase-config.js`.

The public policies are intentionally open so this personal site can create and delete posts without login. Add Supabase Auth before using this for a larger audience.

## 2. Publish with GitHub Pages

1. Create a GitHub repository and upload the project files.
2. Keep `supabase-config.js` in the repository with your Supabase URL and anon key. The anon key is designed for browser use; never put a `service_role` key in this file.
3. In GitHub, open **Settings > Pages**.
4. Set the source to **Deploy from a branch**, choose `main`, and choose `/ (root)`.
5. Open the generated GitHub Pages URL.

The site will use Supabase automatically when both config values are present. Without them, `server.py` remains the local development backend.
