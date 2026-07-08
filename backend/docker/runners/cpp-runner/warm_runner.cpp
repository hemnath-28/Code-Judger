#include <iostream>
#include <string>
#include <vector>
#include <sys/socket.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <chrono>
#include <cstring>
#include <fstream>
#include <sys/stat.h>
#include <dirent.h>

bool read_all(int fd, void* buf, size_t len) {
    char* ptr = (char*)buf;
    while (len > 0) {
        ssize_t bytes = read(fd, ptr, len);
        if (bytes <= 0) return false;
        ptr += bytes;
        len -= bytes;
    }
    return true;
}

bool write_all(int fd, const void* buf, size_t len) {
    const char* ptr = (const char*)buf;
    while (len > 0) {
        ssize_t bytes = write(fd, ptr, len);
        if (bytes <= 0) return false;
        ptr += bytes;
        len -= bytes;
    }
    return true;
}

void delete_directory(const std::string& path) {
    DIR* dir = opendir(path.c_str());
    if (!dir) return;
    struct dirent* entry;
    while ((entry = readdir(dir)) != nullptr) {
        std::string name = entry->d_name;
        if (name == "." || name == "..") continue;
        std::string full_path = path + "/" + name;
        struct stat statbuf;
        if (stat(full_path.c_str(), &statbuf) == 0) {
            if (S_ISDIR(statbuf.st_mode)) {
                delete_directory(full_path);
            } else {
                unlink(full_path.c_str());
            }
        }
    }
    closedir(dir);
    rmdir(path.c_str());
}

bool set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) return false;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK) != -1;
}

bool run_process(const std::vector<std::string>& args, const std::string& input,
                 std::string& out_stdout, std::string& out_stderr, int& out_exit_code,
                 int timeout_ms, bool& out_timed_out, int& out_runtime_ms) {
    int in_pipe[2], out_pipe[2], err_pipe[2];
    if (pipe(in_pipe) < 0 || pipe(out_pipe) < 0 || pipe(err_pipe) < 0) {
        return false;
    }

    auto start_time = std::chrono::high_resolution_clock::now();
    pid_t pid = fork();
    if (pid < 0) {
        return false;
    }

    if (pid == 0) { // Child
        setsid(); // Create process group to kill orphans on timeout
        
        dup2(in_pipe[0], STDIN_FILENO);
        dup2(out_pipe[1], STDOUT_FILENO);
        dup2(err_pipe[1], STDERR_FILENO);

        close(in_pipe[0]); close(in_pipe[1]);
        close(out_pipe[0]); close(out_pipe[1]);
        close(err_pipe[0]); close(err_pipe[1]);

        std::vector<char*> char_args;
        for (const auto& arg : args) {
            char_args.push_back(const_cast<char*>(arg.c_str()));
        }
        char_args.push_back(nullptr);

        execvp(char_args[0], char_args.data());
        exit(127);
    }

    // Parent
    close(in_pipe[0]);
    close(out_pipe[1]);
    close(err_pipe[1]);

    // Feed stdin
    if (!input.empty()) {
        write_all(in_pipe[1], input.data(), input.size());
    }
    close(in_pipe[1]); // Close to trigger EOF in child

    set_nonblocking(out_pipe[0]);
    set_nonblocking(err_pipe[0]);

    struct pollfd fds[2];
    fds[0].fd = out_pipe[0];
    fds[0].events = POLLIN;
    fds[1].fd = err_pipe[0];
    fds[1].events = POLLIN;

    out_stdout.clear();
    out_stderr.clear();
    out_timed_out = false;
    out_exit_code = 0;

    auto end_time = start_time + std::chrono::milliseconds(timeout_ms);
    bool child_finished = false;

    while (true) {
        auto now = std::chrono::high_resolution_clock::now();
        if (now >= end_time) {
            out_timed_out = true;
            break;
        }

        int remaining = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - now).count();
        int poll_ret = poll(fds, 2, remaining);

        if (poll_ret > 0) {
            char buf[4096];
            if (fds[0].revents & POLLIN) {
                while (true) {
                    ssize_t bytes = read(out_pipe[0], buf, sizeof(buf));
                    if (bytes > 0) out_stdout.append(buf, bytes);
                    else if (bytes < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
                    else { fds[0].fd = -1; break; } // EOF or error
                }
            }
            if (fds[1].revents & POLLIN) {
                while (true) {
                    ssize_t bytes = read(err_pipe[0], buf, sizeof(buf));
                    if (bytes > 0) out_stderr.append(buf, bytes);
                    else if (bytes < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) break;
                    else { fds[1].fd = -1; break; } // EOF or error
                }
            }
        }

        int status;
        pid_t wait_ret = waitpid(pid, &status, WNOHANG);
        if (wait_ret == pid) {
            child_finished = true;
            if (WIFEXITED(status)) {
                out_exit_code = WEXITSTATUS(status);
            } else if (WIFSIGNALED(status)) {
                out_exit_code = 128 + WTERMSIG(status);
            }
            break;
        }
    }

    auto execution_end = std::chrono::high_resolution_clock::now();
    out_runtime_ms = std::chrono::duration_cast<std::chrono::milliseconds>(execution_end - start_time).count();

    if (!child_finished) {
        kill(-pid, SIGKILL); // Kill entire process group
        int status;
        waitpid(pid, &status, 0);
        out_exit_code = 124;
    }

    // Read remaining buffer
    char buf[4096];
    ssize_t bytes;
    while ((bytes = read(out_pipe[0], buf, sizeof(buf))) > 0) out_stdout.append(buf, bytes);
    while ((bytes = read(err_pipe[0], buf, sizeof(buf))) > 0) out_stderr.append(buf, bytes);

    close(out_pipe[0]);
    close(err_pipe[0]);

    return true;
}

int main() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        std::cerr << "Failed to create socket\n";
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(8080);

    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        std::cerr << "Bind failed\n";
        return 1;
    }

    if (listen(server_fd, 5) < 0) {
        std::cerr << "Listen failed\n";
        return 1;
    }

    std::cout << "C++ Warm Runner (Binary Protocol) listening on port 8080...\n";

    while (true) {
        int client_socket = accept(server_fd, nullptr, nullptr);
        if (client_socket < 0) continue;

        std::string job_path = "";
        try {
            uint32_t header[3];
            if (!read_all(client_socket, header, 12)) {
                close(client_socket);
                continue;
            }

            uint32_t code_len = ntohl(header[0]);
            uint32_t input_len = ntohl(header[1]);
            uint32_t timeout_ms = ntohl(header[2]);

            std::string code(code_len, '\0');
            std::string input(input_len, '\0');

            if (code_len > 0) read_all(client_socket, &code[0], code_len);
            if (input_len > 0) read_all(client_socket, &input[0], input_len);

            // Create temporary folder in /tmp (world-writable)
            std::string job_id = std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
            job_path = "/tmp/job-" + job_id;
            mkdir(job_path.c_str(), 0777);

            // Write main.cpp
            std::string cpp_path = job_path + "/main.cpp";
            std::ofstream out_file(cpp_path);
            out_file.write(code.data(), code.size());
            out_file.close();

            // Compile main.cpp
            std::string bin_path = job_path + "/main";
            std::vector<std::string> compile_args = {
                "g++", "-std=c++17", "-O2", "-pipe", cpp_path, "-o", bin_path
            };
            std::string compile_stdout, compile_stderr;
            int compile_exit_code = 0;
            bool compile_timed_out = false;
            int compile_runtime = 0;

            run_process(compile_args, "", compile_stdout, compile_stderr, compile_exit_code, 15000, compile_timed_out, compile_runtime);

            if (compile_exit_code != 0) {
                // Compilation error
                uint32_t res_exit = htonl(1);
                uint32_t res_timed_out = 0;
                uint32_t res_runtime = 0;
                uint32_t res_out_len = 0;
                uint32_t res_err_len = htonl(compile_stderr.size());

                write_all(client_socket, &res_exit, 4);
                write_all(client_socket, &res_timed_out, 1);
                write_all(client_socket, &res_runtime, 4);
                write_all(client_socket, &res_out_len, 4);
                write_all(client_socket, &res_err_len, 4);
                if (!compile_stderr.empty()) {
                    write_all(client_socket, compile_stderr.data(), compile_stderr.size());
                }
                throw std::runtime_error("Compilation failed");
            }

            // Run binary
            std::vector<std::string> run_args = { bin_path };
            std::string run_stdout, run_stderr;
            int run_exit_code = 0;
            bool run_timed_out = false;
            int run_runtime = 0;

            run_process(run_args, input, run_stdout, run_stderr, run_exit_code, timeout_ms, run_timed_out, run_runtime);

            if (run_timed_out) {
                run_stderr = "Time Limit Exceeded";
            }

            uint32_t res_exit = htonl(run_exit_code);
            uint8_t res_timed_out = run_timed_out ? 1 : 0;
            uint32_t res_runtime = htonl(run_runtime);
            uint32_t res_out_len = htonl(run_stdout.size());
            uint32_t res_err_len = htonl(run_stderr.size());

            write_all(client_socket, &res_exit, 4);
            write_all(client_socket, &res_timed_out, 1);
            write_all(client_socket, &res_runtime, 4);
            write_all(client_socket, &res_out_len, 4);
            write_all(client_socket, &res_err_len, 4);

            if (!run_stdout.empty()) write_all(client_socket, run_stdout.data(), run_stdout.size());
            if (!run_stderr.empty()) write_all(client_socket, run_stderr.data(), run_stderr.size());

        } catch (const std::exception& e) {
            // Error already written or handled
        }

        if (!job_path.empty()) {
            delete_directory(job_path);
        }
        close(client_socket);
    }

    close(server_fd);
    return 0;
}
