import java.io.*;
import java.net.*;
import java.util.concurrent.TimeUnit;
import java.util.UUID;

public class WarmRunner {

    static class StreamGobbler extends Thread {
        private final InputStream is;
        private final ByteArrayOutputStream bos = new ByteArrayOutputStream();

        StreamGobbler(InputStream is) {
            this.is = is;
        }

        @Override
        public void run() {
            try {
                byte[] buffer = new byte[4096];
                int len;
                while ((len = is.read(buffer)) != -1) {
                    bos.write(buffer, 0, len);
                }
            } catch (IOException e) {
                // Ignore
            }
        }

        byte[] getBytes() {
            return bos.toByteArray();
        }
    }

    private static void deleteDirectory(File directory) {
        File[] allContents = directory.listFiles();
        if (allContents != null) {
            for (File file : allContents) {
                deleteDirectory(file);
            }
        }
        directory.delete();
    }

    public static void main(String[] args) {
        try (ServerSocket serverSocket = new ServerSocket(8080)) {
            System.out.println("Java Warm Runner (Binary Protocol) listening on port 8080...");

            while (true) {
                Socket socket = serverSocket.accept();
                File jobDir = null;
                try (
                    DataInputStream in = new DataInputStream(socket.getInputStream());
                    DataOutputStream out = new DataOutputStream(socket.getOutputStream())
                ) {
                    // Read header
                    int codeLen = in.readInt();
                    int inputLen = in.readInt();
                    int timeoutMs = in.readInt();

                    // Read payloads
                    byte[] codeBytes = new byte[codeLen];
                    in.readFully(codeBytes);
                    byte[] inputBytes = new byte[inputLen];
                    in.readFully(inputBytes);

                    // Create unique directory inside /tmp (world-writable)
                    String jobId = UUID.randomUUID().toString();
                    jobDir = new File("/tmp/job-" + jobId);
                    if (!jobDir.mkdirs()) {
                        throw new IOException("Failed to create job directory");
                    }

                    // Write code to Main.java
                    File sourceFile = new File(jobDir, "Main.java");
                    try (FileOutputStream fos = new FileOutputStream(sourceFile)) {
                        fos.write(codeBytes);
                    }

                    // Compile Main.java
                    ProcessBuilder compileBuilder = new ProcessBuilder("javac", sourceFile.getAbsolutePath());
                    Process compileProc = compileBuilder.start();

                    StreamGobbler compileErrGobbler = new StreamGobbler(compileProc.getErrorStream());
                    compileErrGobbler.start();
                    compileProc.waitFor();
                    compileErrGobbler.join();

                    int compileExit = compileProc.exitValue();
                    if (compileExit != 0) {
                        byte[] errBytes = compileErrGobbler.getBytes();
                        // Write compile error response (exitCode = 1, timedOut = 0, runtime = 0)
                        out.writeInt(1);
                        out.writeByte(0);
                        out.writeInt(0);
                        out.writeInt(0);
                        out.writeInt(errBytes.length);
                        out.write(errBytes);
                        continue;
                    }

                    // Execute Java code
                    ProcessBuilder runBuilder = new ProcessBuilder(
                        "java",
                        "-Xss512k",
                        "-Xmx200m",
                        "-cp",
                        jobDir.getAbsolutePath(),
                        "Main"
                    );
                    
                    long startTime = System.nanoTime();
                    Process runProc = runBuilder.start();

                    // Write stdin
                    if (inputLen > 0) {
                        try (OutputStream stdin = runProc.getOutputStream()) {
                            stdin.write(inputBytes);
                            stdin.flush();
                        }
                    } else {
                        runProc.getOutputStream().close();
                    }

                    // Spin up gobblers to drain stdout/stderr
                    StreamGobbler outGobbler = new StreamGobbler(runProc.getInputStream());
                    StreamGobbler errGobbler = new StreamGobbler(runProc.getErrorStream());
                    outGobbler.start();
                    errGobbler.start();

                    boolean finished = runProc.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
                    long endTime = System.nanoTime();
                    int runtimeMs = (int) ((endTime - startTime) / 1_000_000);

                    int exitCode = 0;
                    boolean timedOut = false;

                    if (!finished) {
                        runProc.destroyForcibly();
                        timedOut = true;
                        exitCode = 124;
                    } else {
                        exitCode = runProc.exitValue();
                    }

                    outGobbler.join();
                    errGobbler.join();

                    byte[] stdoutBytes = outGobbler.getBytes();
                    byte[] stderrBytes = errGobbler.getBytes();

                    if (timedOut) {
                        stderrBytes = "Time Limit Exceeded".getBytes("UTF-8");
                    }

                    // Send response header: exitCode (4B), timedOut (1B), runtimeMs (4B), stdoutLen (4B), stderrLen (4B)
                    out.writeInt(exitCode);
                    out.writeByte(timedOut ? 1 : 0);
                    out.writeInt(runtimeMs);
                    out.writeInt(stdoutBytes.length);
                    out.writeInt(stderrBytes.length);
                    
                    // Send response body
                    out.write(stdoutBytes);
                    out.write(stderrBytes);

                } catch (Exception e) {
                    try {
                        // Return generic execution error
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        PrintStream ps = new PrintStream(baos);
                        e.printStackTrace(ps);
                        byte[] errBytes = baos.toByteArray();
                        
                        DataOutputStream errOut = new DataOutputStream(socket.getOutputStream());
                        errOut.writeInt(1);
                        errOut.writeByte(0);
                        errOut.writeInt(0);
                        errOut.writeInt(0);
                        errOut.writeInt(errBytes.length);
                        errOut.write(errBytes);
                    } catch (Exception ignored) {}
                } finally {
                    if (jobDir != null && jobDir.exists()) {
                        deleteDirectory(jobDir);
                    }
                    try {
                        socket.close();
                    } catch (IOException ignored) {}
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
