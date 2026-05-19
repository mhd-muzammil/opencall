import type { FormEvent } from "react";

export type UploadFileField = "flexWipReport" | "renderwaysReport" | "callPlan";

export interface UploadFileItem {
  field: UploadFileField;
  label: string;
  required: boolean;
  multiple?: boolean;
}

type UploadFilesByField = Partial<Record<UploadFileField, File[]>>;

export function UploadDrawer({
  isOpen,
  isBusy,
  files,
  fileFields,
  onClose,
  onSubmit,
  onFileChange,
}: Readonly<{
  isOpen: boolean;
  isBusy: boolean;
  files: UploadFilesByField;
  fileFields: readonly UploadFileItem[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileChange: (field: UploadFileField, files: File[]) => void;
}>) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="drawerOverlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="opsDrawer uploadDrawer"
        aria-label="Upload source files"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form className="drawerPanel" onSubmit={onSubmit}>
          <div className="drawerHeader">
            <div>
              <p className="eyebrow">Source Intake</p>
              <h2>Upload Files</h2>
              <span>Load the latest source files for matching and report generation.</span>
            </div>
            <button className="secondaryButton drawerClose" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="fileGrid drawerFileGrid">
            {fileFields.map((item) => (
              <label className="fileDrop" key={item.field}>
                <span>
                  {item.label}{" "}
                  <em className={item.required ? "requiredTag" : undefined}>
                    {item.required ? "Required" : "Optional"}
                  </em>
                </span>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  multiple={item.multiple}
                  onChange={(event) =>
                    onFileChange(item.field, Array.from(event.target.files ?? []))
                  }
                />
                <strong>
                  {files[item.field]?.length
                    ? files[item.field]!.map((file) => file.name).join(", ")
                    : item.required ? "Required file not selected" : "Optional"}
                </strong>
              </label>
            ))}
          </div>

          <div className="drawerFooter">
            <button className="secondaryButton" type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={isBusy}>
              {isBusy ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
