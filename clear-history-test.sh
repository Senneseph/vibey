#!/bin/bash

# Script to test the Clear Chat History feature

echo "========================================="
echo "Vibey Clear Chat History Test Script"
echo "========================================="
echo ""

# Check if .vibey/history directory exists
if [ -d ".vibey/history" ]; then
    echo "✓ .vibey/history directory exists"
    
    # List files in the directory
    echo ""
    echo "Files in .vibey/history:"
    ls -lh .vibey/history/
    echo ""
else
    echo "✗ .vibey/history directory does not exist"
fi

echo "Instructions:"
echo "1. Reload the VS Code window (Ctrl+R or Cmd+R)"
echo "2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)"
echo "3. Type 'Vibey: Clear Chat History' and select it"
echo "4. Confirm the action"
echo "5. Check that the chat panel is cleared"
echo ""
echo "To verify the history was cleared, run this script again"
echo "and check that the files are gone or empty."
echo ""

