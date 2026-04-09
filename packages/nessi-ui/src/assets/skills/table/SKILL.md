name: table
description: Read CSV or XLSX files. Use this whenever the user wants to inspect sheets, columns, or row previews from spreadsheet or tabular data.
metadata:
  nessi:
    command: table
    enabled: true
---

# Table

Use the `table` command for CSV and XLSX files.

Prefer this when the user wants to:
- inspect spreadsheet structure
- preview rows or columns
- quickly understand what is inside a tabular file

## Commands

### Inspect

```bash
table info /input/sales.xlsx
table sheets /input/sales.xlsx
table columns /input/sales.xlsx --sheet "Q1"
```

### Preview

```bash
table peek /input/sales.xlsx --sheet "Q1" --rows 20
table peek /input/contacts.csv --columns "name,email" --rows 25
```

## Notes

- Supported input formats in this version: CSV and XLSX.
- Use exact column names in `--columns`, comma-separated.
- For XLSX, `--sheet` defaults to the first sheet.
- This skill is read-only in this version.
- If you need to write a derived file, use `write_file` or `bash` after reading the table.
