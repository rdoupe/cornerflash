#!/bin/bash
cd C:/Users/ryand/Documents/Claude/Projects/CornerFlash
"C:/Users/ryand/AppData/Local/Programs/Python/Python312/python.exe" scripts/extract_corners.py match 2>&1 | tee match_full.log
echo "Exit code: $?" >> match_full.log
