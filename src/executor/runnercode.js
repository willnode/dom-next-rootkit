import { getJavaVersion, getPythonVersion, getRubyVersion } from "../util.js";
import { podmanExec } from "./podman.js";

/**
 * @param {string} key
 * @param {string} value
 * @param {{ (s: string): Promise<void>; (arg0: string): any; }} writeLog
 * @param {{ [x: string]: string; }} domaindata
 * @param {{ (cmd: string, write?: boolean): Promise<any>; (arg0: string, arg1: boolean): any; }} sshExec
 */
export async function runConfigCodeFeatures(key, value, writeLog, domaindata, sshExec) {
    let arg;
    switch (key) {
        case 'docker':
        case 'podman':
            if (value === '' || value === 'on') {
                await writeLog("$> Enabling podman features");
                await writeLog(await podmanExec.enablePodman(domaindata['Username']));
            } else if (value === 'off') {
                await writeLog("$> Disabling podman features");
                await writeLog(await podmanExec.disablePodman(domaindata['Username']));
            }
            break;
        case 'python':
            arg = value;
            if (value == 'off') {
                await writeLog("$> Removing Python engine");
                await sshExec("rm -rf ~/.pyenv");
                await sshExec("pathman remove ~/.pyenv/bin && pathman remove ~/.pyenv/shims");
                await sshExec("sed -i '/pyenv/d' ~/.bashrc");
            } else {
                const parg = getPythonVersion(value);
                await writeLog("$> Changing Python engine to " + parg.version);
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash); source ~/.bashrc");
                await sshExec("command -v pyenv &> /dev/null || (curl -sS https://webinstall.dev/pyenv | bash); source  ~/.config/envman/PATH.env");
                if (parg.binary) {
                    await sshExec(`cd ~/tmp && mkdir -p ~/.pyenv/versions/${parg.version}`);
                    await sshExec(`wget -O python.tar.zst "${parg.binary}" && tar -axf python.tar.zst && rm $_`);
                    await sshExec(`mv ~/tmp/python/install/* ~/.pyenv/versions/${parg.version} || true ; rm -rf ~/tmp/python`);
                    await sshExec(`(cd ~/.pyenv/versions/${parg.version}/bin && ln -s python3 python) || true`);
                    await sshExec("cd ~/public_html", false);
                } else if (parg.version !== "system") {
                    await sshExec(`pyenv install ${parg.version} -s`);
                }
                await sshExec(`pyenv global ${parg.version.replace(":latest", "")} ; source ~/.bashrc`);
                await sshExec("python --version");
            }
            break;
        case 'node':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Node engine");
                await sshExec("rm -rf ~/.local/opt/node-* ~/.local/opt/node ~/Downloads/webi/node");
                await sshExec("rm -rf ~/.cache/yarn ~/.cache/node ~/.config/yarn ~/.npm");
                await sshExec("pathman remove ~/.local/opt/node/bin");
            } else {
                if (value == "latest" || value == "current") {
                    arg = "";
                } else if (!value || value == "stable") {
                    arg = "@lts";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Node engine to " + (value || 'lts'));
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec("pathman add .local/opt/node/bin ; source ~/.config/envman/PATH.env");
                await sshExec(`curl -sS https://webinstall.dev/node${arg} | bash`);
                await sshExec("command -v corepack &> /dev/null || npm i -g corepack && corepack enable");
                await sshExec("node --version");
            }
            break;
        case 'deno':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Deno engine");
                await sshExec("rm -rf ~/.local/opt/deno-* ~/.deno ~/.local/bin/deno ~/Downloads/webi/deno");
                await sshExec("pathman remove ~/.deno/bin/");
            } else {
                if (value == "latest" || value == "current") {
                    arg = "";
                } else if (!value || value == "lts") {
                    arg = "@stable";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Deno engine to " + (value || 'stable'));
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec(`curl -sS https://webinstall.dev/deno${arg} | bash`);
                await sshExec("mkdir -p ~/.deno/bin/ && pathman add ~/.deno/bin/ ; source ~/.config/envman/PATH.env");
                await sshExec("deno --version");
            }
            break;
        case 'go':
        case 'golang':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Golang engine");
                await sshExec("chmod -R 0700 ~/.local/opt/go-*");
                await sshExec("rm -rf ~/.local/opt/go-* ~/.cache/go-build ~/.local/opt/go ~/go ~/Downloads/webi/golang");
                await sshExec("pathman remove .local/opt/go/bin");
            } else {
                if (value == "latest" || value == "current") {
                    arg = "";
                } else if (!value || value == "lts") {
                    arg = "@stable";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Golang engine to " + (value || 'stable'));
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec(`curl -sS https://webinstall.dev/golang${arg} | WEBI__GO_ESSENTIALS=true bash ; source ~/.config/envman/PATH.env`);
                await sshExec("go version");
            }
            break;
        case 'rust':
        case 'rustlang':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Rust engine");
                await sshExec("rustup self uninstall -y");
                await sshExec("pathman remove $HOME/.cargo/bin");
            } else {
                await writeLog(arg ? "$> Changing Rust engine to " + arg : "$> installing Rust engine");
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec(`command -v rustup &> /dev/null || (curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain none)`);
                await sshExec(`pathman add $HOME/.cargo/bin ; source ~/.config/envman/PATH.env`);
                if (!arg || ["current", "latest", "lts"].includes(arg)) {
                    arg = "stable"
                }
                await sshExec(`rustup toolchain install ${arg} --profile minimal && rustup default ${arg}`);
                await sshExec("rustc --version");
            }
            break;
        case 'ruby':
            if (value == 'off') {
                await writeLog("$> Removing Ruby engine");
                await sshExec(`rm -rf ~/.rvm`);
                await sshExec("sed -i '/rvm\\|RVM/d' ~/.bashrc");
            } else {
                await writeLog(value ? "$> Changing Ruby engine to " + value : "$> installing Ruby engine");
                await sshExec(`command -v rvm &> /dev/null || { curl -sSL https://rvm.io/mpapis.asc | gpg --import -; curl -sSL https://rvm.io/pkuczynski.asc | gpg --import -; }`);
                await sshExec(`command -v rvm &> /dev/null || { curl -sSL https://get.rvm.io | bash -s stable; source ~/.rvm/scripts/rvm; rvm autolibs disable; }`);
                await sshExec(`rvm install ${getRubyVersion(value)} --no-docs`);
                await sshExec("ruby --version");
            }
            break;
        case 'bun':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Bun engine");
                await sshExec("chmod -R 0700 ~/.local/opt/bun-*");
                await sshExec("rm -rf ~/.local/opt/bun-* ~/.local/opt/bun ~/Downloads/webi/bun");
                await sshExec("pathman remove .local/opt/bun/bin");
            } else {
                if (value == "latest" || value == "current" || !value || value == "lts") {
                    arg = "";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Bun engine to " + (value || 'latest'));
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec(`curl -sS https://webinstall.dev/bun${arg} | bash ; source ~/.config/envman/PATH.env`);
                await sshExec(`(cd ~/.local/bin/; wget -qO- https://github.com/domcloud/proxy-fix/releases/download/v0.1.3/proxy-fix-linux-amd64.tar.gz | tar xz && mv proxy-fix-linux-amd64 bunfix)`);
                await sshExec("bun --version");
            }
            break;
        case 'zig':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Zig engine");
                await sshExec("rm -rf ~/.local/opt/zig ~/Downloads/webi/zig");
                await sshExec("pathman remove .local/opt/zig/bin");
            } else {
                if (value == "latest" || value == "current" || !value || value == "lts") {
                    arg = "";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Zig engine to " + (value || 'latest'));
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec(`curl -sS https://webinstall.dev/zig${arg} | bash ; source ~/.config/envman/PATH.env`);
                await sshExec("zig version");
            }
            break;
        case 'dotnet':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Dotnet engine");
                await sshExec("rm -rf ~/.dotnet");
                await sshExec("pathman remove ~/.dotnet");
            } else {
                if (value == "latest" || value == "current") {
                    arg = "--version latest";
                } else if (!value || value == "lts" || value == "stable") {
                    arg = "--channel LTS";
                } else if (value == "sts") {
                    arg = "--channel STS";
                } else {
                    arg = '--channel ' + value;
                }
                await writeLog("$> Changing Dotnet engine to " + (value || 'lts'));
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash) ; source ~/.bashrc");
                await sshExec(`(curl -sS https://dotnet.microsoft.com/download/dotnet/scripts/v1/dotnet-install.sh | bash -s -- ${arg})`);
                await sshExec(`pathman add ~/.dotnet ; source ~/.config/envman/PATH.env`);
                await sshExec("dotnet --version");
            }
            break;
        case 'jdk':
        case 'java':
            arg = value;
            if (value == 'off') {
                await writeLog("$> Removing Java engine");
                await sshExec("rm -rf ~/.local/java");
                await sshExec("pathman remove ~/.local/java/jdk/bin");
            } else {
                const jarg = getJavaVersion(value);
                if (!jarg.binary) {
                    throw new Error(`No Java with version ${value} is available to install`);
                }
                await writeLog("$> Changing Java engine to " + jarg.version);
                await sshExec("command -v pathman &> /dev/null || (curl -sS https://webinstall.dev/pathman | bash); source ~/.bashrc");
                await sshExec(`cd ~/tmp && mkdir -p ~/.local/java/jdk-${jarg.version}`);
                await sshExec(`wget "${jarg.binary}" -O ~/tmp/jdk.tar.gz && tar -axf jdk.tar.gz && rm $_`);
                await sshExec(`mv ~/tmp/jdk-*/* ~/.local/java/jdk-${jarg.version} || true ; rm -rf ~/tmp/jdk-*`);
                await sshExec(`ln -sfn ~/.local/java/jdk-${jarg.version} ~/.local/java/jdk`);
                await sshExec(`pathman add ~/.local/java/jdk/bin ; source ~/.config/envman/PATH.env`);
                await sshExec("cd ~/public_html", false);
                await sshExec("java --version");
            }
            break;
        default:
            break;
    }
    return arg;
}