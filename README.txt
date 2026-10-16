LIFFAN AUTH HELPER FIX

This patch supplies the missing shared helper imported by the existing Pages Functions:
  functions/_lib/auth.js

INSTALL
1. Extract this ZIP.
2. Copy the included functions folder into the ROOT of your existing
   liffan-all-school-platform-starter project.
3. If prompted about files, it only contains functions/_lib/auth.js. Do not replace
   any other existing files.
4. In the project terminal run:
     npm run build
5. If build succeeds, deploy to the existing Pages project:
     npx wrangler pages deploy dist --project-name=all-school-management-system --branch=main

NOTE
This is a missing-file fix for the imports in the code addition. It does not by itself
prove every API works against the remote database; test with sample data only.
