#!/bin/bash
# This script uploads the graph data to Firebase Storage and makes it public.

# 1. Upload the file
gsutil cp graph-data.json gs://phxlast-34481.appspot.com/

# 2. Set public read access
gsutil acl ch -u AllUsers:R gs://phxlast-34481.appspot.com/graph-data.json

echo "✅ Graph data successfully deployed and set to public."
