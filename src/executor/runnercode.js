import { getJavaVersion, getPythonVersion, getRubyVersion } from "../util.js";
import { dockerExec } from "./docker.js";
import { logmanExec } from "./logman.js";

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
        case 'restart':
            await writeLog("$> Restarting passenger processes");
            await writeLog(await logmanExec.restartPassenger(domaindata));
            break;
        case 'yum':
        case 'dnf':
            await writeLog("$> Setting up environment for yum installation");
            await sshExec(`sed -i '\\|~/usr/lib64/|d' ~/.bashrc`, false);
            await sshExec(`pathman add ~/usr/bin`);
            await sshExec(`echo "export LD_LIBRARY_PATH=~/usr/lib64/:$LD_LIBRARY_PATH" >> ~/.bashrc`)
            if (value != "") {
                await writeLog("$> Installing packages via yum");
                await sshExec(`DNFDIR="/var/tmp/dnf-$USER-dwnlddir"`, false);
                await sshExec(`[ ! -d $DNFDIR ] && { cp -r /var/cache/dnf $DNFDIR ; chmod -R 0700 $DNFDIR ; }`, false);
                await sshExec(`mkdir -p ~/Downloads; pushd ~/Downloads`, false);
                await sshExec(`dnf download ${value} --resolve -y`);
                await sshExec(`rpm2cpio *.rpm | cpio -idmD ~`);
                await sshExec(`popd`, false);
            }
            await sshExec(`. ~/.bashrc`, false)
            break;
        case 'docker':
            if (value === '' || value === 'on') {
                await writeLog("$> Enabling docker features");
                await writeLog(await dockerExec.enableDocker(domaindata['Username']));
                await sshExec(`sed -i '/DOCKER_HOST=/d' ~/.bashrc`, false);
                await sshExec(`echo "export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock" >>  ~/.bashrc;`);
                await sshExec(`mkdir -p ~/.config/docker; echo '{"exec-opts": ["native.cgroupdriver=cgroupfs"]}' > ~/.config/docker/daemon.json`);
                await sshExec(`dockerd-rootless-setuptool.sh install --skip-iptables`);
                await sshExec(`export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock`, false);
            } else if (value === 'off') {
                await writeLog("$> Disabling docker features");
                await sshExec(`dockerd-rootless-setuptool.sh uninstall`);
                await sshExec(`sed -i '/DOCKER_HOST=/d' ~/.bashrc`);
                await sshExec(`rm -rf ~/.config/docker`);
                await writeLog(await dockerExec.disableDocker(domaindata['Username']));
            }
            break;
        case 'python':
            arg = value;
            if (value == 'off') {
                await writeLog("$> Removing Python engine");
                await sshExec("rm -rf ~/.pyenv");
                await sshExec("sed -i '/pyenv/d' ~/.bashrc");
            } else {
                const parg = getPythonVersion(value);
                await writeLog("$> Changing Python engine to " + parg.version);
                await sshExec("command -v pyenv &> /dev/null || (curl -sS https://webinstall.dev/pyenv | bash); source ~/.config/envman/PATH.env");
                if (parg.binary) {
                    await sshExec(`cd ~/tmp && mkdir -p ~/.pyenv/versions/${parg.version}`);
                    await sshExec(`wget -O python.tar.zst "${parg.binary}" && tar -axf python.tar.zst && rm $_`);
                    await sshExec(`mv ~/tmp/python/install/* ~/.pyenv/versions/${parg.version} || true ; rm -rf ~/tmp/python`);
                    await sshExec(`echo "export LD_LIBRARY_PATH=~/.pyenv/versions/${parg.version}:$LD_LIBRARY_PATH" >> ~/.bashrc`) // fix venv
                    await sshExec("cd ~/public_html", false);
                } else if (parg.version !== "system") {
                    await sshExec(`pyenv install ${parg.version} -s`);
                }
                await sshExec(`pyenv global ${parg.version.replace(":latest", "")}`);
                await sshExec(`source ~/.bashrc`, false)
                await sshExec("python --version");
            }
            break;
        case 'node':
            arg = value;
            if (arg == 'off') {
                await writeLog("$> Removing Node engine");
                await sshExec("rm -rf ~/.local/opt/node-* ~/.local/opt/node ~/Downloads/webi/node");
                await sshExec("rm -rf ~/.cache/yarn ~/.cache/node ~/.config/yarn ~/.npm ~/.nvm");
                await sshExec("pathman remove .local/opt/node/bin");
            } else {
                if (value == "latest" || value == "current") {
                    arg = "node";
                } else if (!value || value == "stable" || value == "lts") {
                    arg = "lts/*";
                } else {
                    arg = value;
                }
                await writeLog("$> Changing Node engine to " + (value || 'lts'));
                const nvmPath = `https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh`;
                await sshExec(`command -v nvm &> /dev/null || (curl -o- ${nvmPath} | bash) && source ~/.bashrc`);
                await sshExec(`nvm install ${arg} -b && nvm use ${arg} && nvm alias default ${arg}`);
                await sshExec("command -v corepack &> /dev/null || npm i -g corepack && corepack enable");
                await sshExec(`[[ -z $COREPACK_ENABLE_AUTO_PIN ]] && echo "export COREPACK_ENABLE_AUTO_PIN=0" >> ~/.bashrc`)
                await sshExec("source ~/.bashrc", false);
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
                await sshExec(`curl -sS https://webinstall.dev/deno${arg} | bash`);
                await sshExec("mkdir -p ~/.deno/bin/ && pathman add ~/.deno/bin/");
                await sshExec("source ~/.bashrc", false);
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
            } else {
                if (value == "latest" || value == "current") {
                    arg = "";
                } else if (!value || value == "lts") {
                    arg = "@stable";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Golang engine to " + (value || 'stable'));
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
                await sshExec(`pathman remove $HOME/.cargo/bin`);
            } else {
                await writeLog(arg ? "$> Changing Rust engine to " + arg : "$> installing Rust engine");
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
                const rarg = getRubyVersion(value);
                await writeLog("$> Changing Ruby engine to " + rarg.version);
                await sshExec(`command -v rvm &> /dev/null || { curl -sSL https://rvm.io/mpapis.asc | gpg --import -; curl -sSL https://rvm.io/pkuczynski.asc | gpg --import -; }`);
                await sshExec(`command -v rvm &> /dev/null || { curl -sSL https://get.rvm.io | bash -s stable; source ~/.rvm/scripts/rvm; rvm autolibs disable; }`);
                // GLIBC Compability issue -- Need to wait until RHEL 10?
                // if (rarg.binary) {
                //     await sshExec(`cd ~/tmp && mkdir -p ~/.rvm/rubies/ruby-${rarg.version}`);
                //     await sshExec(`wget -O ruby.tar.gz "${rarg.binary}" && tar -axf ruby.tar.gz && rm $_`);
                //     const rsubdir = process.arch;
                //     await sshExec(`mv ~/tmp/${rsubdir}/* ~/.rvm/rubies/ruby-${rarg.version} || true ; rm -rf ~/tmp/${rsubdir}`);
                //     await sshExec(`find ~/.rvm/rubies/ruby-${rarg.version}/bin -type f -exec sed -i 's|^#!/opt/hostedtoolcache/.*|#!/bin/env ruby|' {} +`);
                //     await sshExec(`echo "export LD_LIBRARY_PATH=~/.rvm/rubies/ruby-${rarg.version}/lib:$LD_LIBRARY_PATH" >> ~/.bashrc`) // fix venv
                //     await sshExec("cd ~/public_html", false);
                // }                
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
            } else {
                if (value == "latest" || value == "current" || !value || value == "lts") {
                    arg = "";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Bun engine to " + (value || 'latest'));
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
            } else {
                if (value == "latest" || value == "current" || !value || value == "lts") {
                    arg = "";
                } else {
                    arg = "@" + value;
                }
                await writeLog("$> Changing Zig engine to " + (value || 'latest'));
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
                await sshExec(`cd ~/tmp && mkdir -p ~/.local/java/jdk-${jarg.version}`);
                await sshExec(`wget "${jarg.binary}" -O ~/tmp/jdk.tar.gz && tar -axf jdk.tar.gz && rm $_`);
                await sshExec(`mv ~/tmp/jdk-*/* ~/.local/java/jdk-${jarg.version} || true ; rm -rf ~/tmp/jdk-*`);
                await sshExec(`ln -sfn ~/.local/java/jdk-${jarg.version} ~/.local/java/jdk`);
                await sshExec(`pathman add ~/.local/java/jdk/bin ; source ~/.config/envman/PATH.env`);
                await sshExec("cd ~/public_html", false);
                await sshExec("java --version");
            }
            break;
        case 'neovim':
        case 'nvim':
            if (value == 'off') {
                await writeLog("$> Removing Neovim config");
                await sshExec(`rm -rf ~/.config/nvim ~/.local/state/nvim ~/.local/share/nvim`);
            } else {
                await writeLog("$> Installing Neovim Nvchad config");
                await sshExec(`git clone https://github.com/NvChad/starter ~/.config/nvim`);
            }
            break;
        default:
            break;
    }
    return arg;
}
