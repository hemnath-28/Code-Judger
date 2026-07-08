import socket
import struct
import subprocess
import tempfile
import os
import time

def recv_all(sock, length):
    data = b''
    while len(data) < length:
        packet = sock.recv(length - len(data))
        if not packet:
            return None
        data += packet
    return data

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', 8080))
    server.listen(5)
    print("Python Warm Runner (Binary Protocol) listening on port 8080...", flush=True)

    while True:
        conn, addr = server.accept()
        try:
            # Read 12-byte header: code_len (4B), input_len (4B), timeout_ms (4B)
            header = recv_all(conn, 12)
            if not header:
                conn.close()
                continue
            
            code_len, input_len, timeout_ms = struct.unpack(">III", header)
            
            # Read code and input bodies
            code_bytes = recv_all(conn, code_len) if code_len > 0 else b''
            input_bytes = recv_all(conn, input_len) if input_len > 0 else b''
            
            code = code_bytes.decode('utf-8')
            input_data = input_bytes.decode('utf-8')

            # Create temporary execution file in /tmp (world-writable)
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, dir='/tmp') as f:
                f.write(code)
                temp_file_path = f.name
            
            os.chmod(temp_file_path, 0o644)
            
            start_time = time.perf_counter()
            try:
                result = subprocess.run(
                    ['python3', temp_file_path],
                    input=input_data,
                    capture_output=True,
                    text=True,
                    timeout=timeout_ms / 1000.0
                )
                stdout = result.stdout
                stderr = result.stderr
                exit_code = result.returncode
                timed_out = False
            except subprocess.TimeoutExpired as e:
                stdout = e.stdout or ""
                stderr = e.stderr or "Time Limit Exceeded"
                exit_code = 124
                timed_out = True
            finally:
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
            
            runtime_ms = int((time.perf_counter() - start_time) * 1000)
            
            # Encode response
            stdout_bytes = stdout.encode('utf-8')
            stderr_bytes = stderr.encode('utf-8')
            
            # Response header: exit_code (4B), timed_out (1B), runtime_ms (4B), stdout_len (4B), stderr_len (4B)
            response_header = struct.pack(
                ">iBIII",
                exit_code,
                1 if timed_out else 0,
                runtime_ms,
                len(stdout_bytes),
                len(stderr_bytes)
            )
            
            conn.sendall(response_header + stdout_bytes + stderr_bytes)
        except Exception as e:
            err_msg = str(e).encode('utf-8')
            # Error response: exit_code=1, timed_out=0, runtime_ms=0, stdout_len=0, stderr_len=err_len
            err_header = struct.pack(">iBIII", 1, 0, 0, 0, len(err_msg))
            try:
                conn.sendall(err_header + err_msg)
            except:
                pass
        finally:
            conn.close()

if __name__ == '__main__':
    main()
