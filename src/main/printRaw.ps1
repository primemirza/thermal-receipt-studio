param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath)) {
  throw "File tidak ditemukan: $FilePath"
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA
  {
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void SendBytes(string printerName, byte[] bytes)
  {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
    {
      throw new Exception("OpenPrinter gagal: " + Marshal.GetLastWin32Error());
    }

    try
    {
      var di = new DOCINFOA();
      di.pDocName = "ThermalReceiptStudio";
      di.pDataType = "RAW";

      if (!StartDocPrinter(hPrinter, 1, di))
      {
        throw new Exception("StartDocPrinter gagal: " + Marshal.GetLastWin32Error());
      }

      try
      {
        if (!StartPagePrinter(hPrinter))
        {
          throw new Exception("StartPagePrinter gagal: " + Marshal.GetLastWin32Error());
        }

        try
        {
          int dwWritten = 0;
          IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

          try
          {
            if (!WritePrinter(hPrinter, unmanagedBytes, bytes.Length, out dwWritten))
            {
              throw new Exception("WritePrinter gagal: " + Marshal.GetLastWin32Error());
            }
            if (dwWritten != bytes.Length)
            {
              throw new Exception("WritePrinter tidak menulis semua bytes (" + dwWritten + "/" + bytes.Length + ")");
            }
          }
          finally
          {
            Marshal.FreeCoTaskMem(unmanagedBytes);
          }
        }
        finally
        {
          EndPagePrinter(hPrinter);
        }
      }
      finally
      {
        EndDocPrinter(hPrinter);
      }
    }
    finally
    {
      ClosePrinter(hPrinter);
    }
  }
}
"@

[RawPrinter]::SendBytes($PrinterName, $bytes)
