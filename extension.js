'use strict';

const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

let channel = null;

function findKinc(channel) {
	let localkincpath = path.resolve(vscode.workspace.rootPath, 'Kinc');
	if (fs.existsSync(localkincpath) && fs.existsSync(path.join(localkincpath, 'Tools', 'kmake', 'kmake'))) return localkincpath;
	let kincpath = vscode.workspace.getConfiguration('kinc').kincPath;
	if (kincpath.length > 0) {
		return path.isAbsolute(kincpath) ? kincpath : path.resolve(vscode.workspace.rootPath, kincpath);
	}

	if (channel) {
		channel.appendLine('Warning: Falling back to integrated Kinc. Consider downloading an up to date version and setting the kincPath option.');
	}
	return path.join(vscode.extensions.getExtension('kodetech.kinc').extensionPath, 'Kinc');
}

function sys() {
	if (os.platform() === 'linux') {
		if (os.arch() === 'arm') return '-linuxarm';
		else if (os.arch() === 'arm64') return '-linuxaarch64';
		else if (os.arch() === 'x64') return '-linux64';
		else return '-linux32';
	}
	else if (os.platform() === 'win32') {
		return '.exe';
	}
	else if (os.platform() === 'freebsd') {
		return '-freebsd';
	}
	else {
		return '-osx';
	}
}

function findKmake(channel) {
	return path.join(findKinc(channel), 'Tools', 'kmake', 'kmake' + sys());
}

function findFFMPEG() {
	return vscode.workspace.getConfiguration('kinc').ffmpeg;
}

function createOptions(target, compile) {
	const options = [
		'--from', vscode.workspace.rootPath,
		'--to', path.join(vscode.workspace.rootPath, vscode.workspace.getConfiguration('kinc').buildDir),
		'-t', target,
		'--ffmpeg', findFFMPEG()
	];
	if (compile) {
		options.push('--compile');
	}
	return options;
}

function compile(target, silent) {
	return new Promise((resolve, reject) => {
		if (!silent) {
			channel.appendLine('Saving all files.');
			vscode.commands.executeCommand('workbench.action.files.saveAll');
		}
	
		if (!vscode.workspace.rootPath) {
			channel.appendLine('No project opened.');
			reject();
			return;
		}
	
		if (!fs.existsSync(path.join(vscode.workspace.rootPath, 'kfile.js'))) {
			channel.appendLine('No kfile found.');
			reject();
			return;
		}
	
		if (!fs.existsSync(path.join(vscode.workspace.rootPath, 'khafile.js'))) {
			channel.appendLine('khafile found.');
			reject();
			return;
		}
	
		const child = child_process.spawn(findKmake(channel), createOptions(target, true));
	
		child.stdout.on('data', (data) => {
			channel.appendLine(data);
		});
	
		child.stderr.on('data', (data) => {
			channel.appendLine(data);
		});
	
		child.on('error', (err) => {
			channel.appendLine('Could not start kmake to compile the project.');
		});
	
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			}
			else {
				reject();
			}
		});
	});
}

let KincDisplayArgumentsProvider = {
	init: (api, activationChangedCallback) => {
		this.api = api;
		this.activationChangedCallback = activationChangedCallback;
		this.description = 'Kinc project';
	},
	activate: (provideArguments) => {
		this.updateArgumentsCallback = provideArguments;
		if (this.args) {
			this.update(this.args);
		}
		this.activationChangedCallback(true);
	},
	deactivate: () => {
		this.updateArgumentsCallback = null;
		this.activationChangedCallback(false);
	},
	update: (args) => {
		if (this.args !== args && this.api) {
			this.args = args;
			this.parsedArguments = this.api.parseHxmlToArguments(args);
			if (this.updateArgumentsCallback) {
				this.updateArgumentsCallback(this.parsedArguments);
			}
		}
	}
}

function updateHaxeArguments(rootPath, hxmlPath) {
	const hxml = fs.readFileSync(hxmlPath, 'utf8');
	const buildDir = vscode.workspace.getConfiguration('kinc').buildDir;
	KincDisplayArgumentsProvider.update('--cwd ' + path.join(rootPath, buildDir) + '\n' + hxml);
}

function sys() {
	if (os.platform() === 'win32') {
		return '.exe';
	}
	else if (os.platform() === 'darwin') {
		return '-osx';
	}
	else {
		if (os.arch() === 'arm') return '-linuxarm';
		else if (os.arch() === 'x64') return '-linux64';
		else return '-linux32';
	}
}

function currentPlatform() {
	if (os.platform() === 'win32') {
		return 'windows';
	}
	else if (os.platform() === 'darwin') {
		return 'osx';
	}
	else {
		return 'linux'
	}

}

function chmodEverything() {
	if (os.platform() === 'win32') {
		return;
	}
	const base = findKinc();
	fs.chmodSync(path.join(base, 'Tools', 'kraffiti', 'kraffiti' + sys()), 0o755);
	fs.chmodSync(path.join(base, 'Tools', 'krafix', 'krafix' + sys()), 0o755);
	fs.chmodSync(path.join(base, 'Tools', 'kmake', 'kmake' + sys()), 0o755);
}

function checkProject(rootPath) {
	if (!fs.existsSync(path.join(rootPath, 'kfile.js'))) {
		return;
	}

	if (fs.existsSync(path.join(rootPath, 'khafile.js'))) {
		return;
	}

	if (findKinc() === path.join(vscode.extensions.getExtension('kodetech.kinc').extensionPath, 'Kinc')) {
		chmodEverything()
	}

	const options = createOptions(currentPlatform(), false);
	options.push('--vscode');
	options.push('--noshaders');
	child_process.spawnSync(findKmake(channel), options);

	/*const protoPath = path.join(rootPath, '.vscode', 'protolaunch.json');
	let proto = null;
	if (fs.existsSync(protoPath)) {
		proto = JSON.parse(fs.readFileSync(protoPath, 'utf-8'));
	}

	const configuration = vscode.workspace.getConfiguration();
	let config = configuration.get('launch');
	config.configurations = config.configurations.filter((value) => {
		return !value.name.startsWith('Kinc: ');
	});
	if (proto) {
		config.configurations.push(proto);
	}
	configuration.update('launch', config, false);*/
}

const KincTaskProvider = {
	provideTasks: () => {
		let workspaceRoot = vscode.workspace.rootPath;
		if (!workspaceRoot) {
			return [];
		}

		const systems = [
			{ arg: 'windows', name: 'Windows', default: false, withdebug: true },
			{ arg: 'windows', name: 'Windows (Direct3D 12)', default: false, graphics: 'direct3d12' , withdebug: true},
			{ arg: 'windows', name: 'Windows (Direct3D 9)', default: false, graphics: 'direct3d9' , withdebug: true},
			{ arg: 'windows', name: 'Windows (Vulkan)', default: false, graphics: 'vulkan' , withdebug: true},
			{ arg: 'windows', name: 'Windows (OpenGL)', default: false, graphics: 'opengl' , withdebug: true},
			{ arg: 'windowsapp', name: 'Windows Universal', default: false , withdebug: true},
			{ arg: 'osx', name: 'macOS', default: false , withdebug: true},
			{ arg: 'osx', name: 'macOS (OpenGL)', default: false, graphics: 'opengl' , withdebug: true},
			{ arg: 'linux', name: 'Linux', default: false , withdebug: true},
			{ arg: 'linux', name: 'Linux (Vulkan)', default: false, graphics: 'vulkan' , withdebug: true},
			{ arg: 'android', name: 'Android', default: false , withdebug: false},
			{ arg: 'ios', name: 'iOS', default: false , withdebug: false},
			{ arg: 'ios', name: 'iOS (OpenGL)', default: false, graphics: 'opengl' , withdebug: false},
			{ arg: 'pi', name: 'Raspberry Pi', default: false , withdebug: false},
			{ arg: 'tvos', name: 'tvOS', default: false , withdebug: false},
			{ arg: 'tizen', name: 'Tizen', default: false , withdebug: false},
			{ arg: 'html5', name: 'HTML5', default: false , withdebug: false},
			{ arg: 'ps4', name: 'PlayStation 4', default: false , withdebug: false},
			{ arg: 'xboxone', name: 'Xbox One', default: false , withdebug: false},
			{ arg: 'switch', name: 'Switch', default: false , withdebug: false},
			{ arg: 'ps5', name: 'PlayStation 5', default: false , withdebug: false},
			{ arg: 'xboxscarlett', name: 'Xbox Series X|S', default: false , withdebug: false},
			{ arg: 'stadia', name: 'Stadia', default: false , withdebug: false}
		];

		let tasks = [];
		for (const system of systems) {
			let debugflags = system.withdebug ? [false, true] : [false];
			for (const debugflag of debugflags) {
				let args = [system.arg];

				if (findFFMPEG().length > 0) {
					args.push('--ffmpeg');
					args.push(findFFMPEG());
				}

				args.push('--compile');
				if (debugflag) {
					args.push('--debug');
				}

				if (system.graphics) {
					args.push('--graphics');
					args.push(system.graphics);
				}

				let kind = {
					type: 'Kinc',
					target: system.name,
				}

				let prefix = '';
				if (debugflag) {
					kind.target += ' Debug';
					prefix = 'Debug ';
				}

				let task = null;
				let kmakePath = findKmake();

				// On Windows, git bash shell won't accept backward slashes and will fail,
				// so we explicitly need to convert path to unix-style.
				const winShell = vscode.workspace.getConfiguration('terminal.integrated.shell').get('windows');
				if (os.platform() === 'win32' && winShell && winShell.indexOf('bash.exe') > -1) {
					kmakePath = kmakePath.replace(/\\/g, '/');
				}

				task = new vscode.Task(kind, vscode.TaskScope.Workspace, `${prefix}Build for ${system.name}`, 'Kinc', new vscode.ShellExecution(kmakePath, args), ['$msCompile']);
				task.group = vscode.TaskGroup.Build;
				tasks.push(task);
			}
		}

		return tasks;
	},
	resolveTask: (task, token) => {
		return task;
	}
}

const KincDebugProvider = {
	provideDebugConfigurations: (folder) => {
		let configs = [];

		folder.uri;

		const buildDir = vscode.workspace.getConfiguration('kinc').buildDir;
		configs.push({
			name: 'Kinc: Launch',
			request: 'launch',
			type: 'kinc',
			appDir: '${workspaceFolder}/' + buildDir,
			preLaunchTask: 'Kinc: Build',
			internalConsoleOptions: 'openOnSessionStart',
		});

		return configs;
	},
	resolveDebugConfiguration: (folder, debugConfiguration) => {
		return undefined;
	}
}

//let currentTarget = 'HTML5';

exports.activate = (context) => {
	channel = vscode.window.createOutputChannel('Kinc');

	if (vscode.workspace.rootPath) {
		checkProject(vscode.workspace.rootPath);
	}

	let provider = vscode.workspace.registerTaskProvider('Kinc', KincTaskProvider);
	context.subscriptions.push(provider);

	// TODO: Figure out why this prevents debugging
	// let debugProvider = vscode.debug.registerDebugConfigurationProvider('kinc', KincDebugProvider);
	// context.subscriptions.push(debugProvider);

	vscode.workspace.onDidChangeWorkspaceFolders((e) => {
		for (let folder of e.added) {
			if (folder.uri.fsPath) {
				checkProject(folder.uri.fsPath);
			}
		}
	});

	let disposable = vscode.commands.registerCommand('kinc.init', function () {
		if (!vscode.workspace.rootPath) {
			channel.appendLine('No project opened.');
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'kfile.js'))
		|| fs.existsSync(path.join(vscode.workspace.rootPath, 'kincfile.js'))
		|| fs.existsSync(path.join(vscode.workspace.rootPath, 'korefile.js'))) {
			channel.appendLine('A Kinc project already exists in the project directory.');
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'khafile.js'))) {
			channel.appendLine('A Kha project already exists in the project directory.');
			return;
		}

		const child = child_process.spawn(findKmake(channel), ['--init', '--name', 'Project', '--from', vscode.workspace.rootPath]);

		child.on('error', (err) => {
			channel.appendLine('Could not start kmake to initialize a new project.');
		});

		child.on('close', (code) => {
			if (code === 0) {
				vscode.commands.executeCommand('workbench.action.reloadWindow');
				vscode.window.showInformationMessage('Kinc project created.');
			}
			else {
				channel.appendLine('kmake --init returned an error.');
			}
		});
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('kinc.findKinc', () => {
		return findKinc();
	});

	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('kinc.findFFMPEG', () => {
		return findFFMPEG();
	});

	context.subscriptions.push(disposable);

	/*const targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	targetItem.text = '$(desktop-download) HTML5';
	targetItem.tooltip = 'Select Completion Target';
	targetItem.command = 'kha.selectCompletionTarget';
	targetItem.show();
	context.subscriptions.push(targetItem);

	disposable = vscode.commands.registerCommand("kha.selectCompletionTarget", () => {
		let items = ['HTML5', 'Krom', 'Kinc', 'Android (Java)', 'Flash', 'HTML5-Worker', 'Java', 'Node.js', 'Unity', 'WPF'];
		vscode.window.showQuickPick(items).then((choice) => {
			if (!choice || choice === currentTarget) {
				return;
			}

			currentTarget = choice;
			targetItem.text = '$(desktop-download) ' + choice;

			function choiceToHxml() {
				switch (choice) {
					case 'HTML5':
						return 'debug-html5';
					case 'Krom':
						return 'krom';
					case 'Kinc':
						switch (process.platform) {
							case 'win32':
								return 'windows';
							case 'darwin':
								return 'osx';
							case 'linux':
								return 'linux';
							default:
								return process.platform;
						}
					case 'Android (Java)':
						return 'android';
					case 'Flash':
						return 'flash';
					case 'HTML5-Worker':
						return 'html5worker';
					case 'Java':
						return 'java';
					case 'Node.js':
						return 'node';
					case 'Unity':
						return 'unity';
					case 'WPF':
						return 'wpf';
				}
			}

			const rootPath = vscode.workspace.rootPath;
			const buildDir = vscode.workspace.getConfiguration('kha').buildDir;
			const hxmlPath = path.join(rootPath, buildDir, 'project-' + choiceToHxml() + '.hxml');
			if (fs.existsSync(hxmlPath)) {
				updateHaxeArguments(rootPath, hxmlPath);
			}
			else {
				compile(choiceToHxml(), true).then(() => {
					updateHaxeArguments(rootPath, hxmlPath);
				});
			}
		});
	});
	context.subscriptions.push(disposable);*/

	let api = {
		findKinc: findKinc,
		findFFMPEG: findFFMPEG,
		compile: compile
	};

	return api;
};

exports.deactivate = () => {

};
