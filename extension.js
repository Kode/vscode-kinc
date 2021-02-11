'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

let channel = null;

function findKinc(channel) {
	let localkincpath = path.resolve(vscode.workspace.rootPath, 'Kinc');
	if (fs.existsSync(localkincpath) && fs.existsSync(path.join(localkincpath, 'Tools', 'kincmake', 'out', 'main.js'))) return localkincpath;
	let kincpath = vscode.workspace.getConfiguration('kinc').kincPath;
	if (kincpath.length > 0) {
		return path.isAbsolute(kincpath) ? kincpath : path.resolve(vscode.workspace.rootPath, kincpath);
	}

	if (channel) {
		channel.appendLine('Warning: Falling back to integrated Kinc. Consider downloading an up to date version and setting the kincPath option.');
	}
	return path.join(vscode.extensions.getExtension('kodetech.kinc').extensionPath, 'Kinc');
}

function findFFMPEG() {
	return vscode.workspace.getConfiguration('kinc').ffmpeg;
}

function createOptions(target, kincfile) {
	return {
		from: vscode.workspace.rootPath,
		to: path.join(vscode.workspace.rootPath, vscode.workspace.getConfiguration('kinc').buildDir),
		kincfile: kincfile,
		target: target,
		vr: 'none',
		pch: false,
		intermediate: '',
		graphics: 'default',
		visualstudio: 'vs2019',
		haxe: '',
		ogg: '',
		aac: '',
		mp3: '',
		h264: '',
		webm: '',
		wmv: '',
		theora: '',
		kfx: '',
		krafix: '',
		ffmpeg: findFFMPEG(),
		nokrafix: false,
		embedflashassets: false,
		compile: true,
		run: false,
		init: false,
		name: 'Project',
		server: false,
		port: 8080,
		debug: true,
		silent: false,
		watch: false,
		shaderversion: 0,
		parallelAssetConversion: 0,
		haxe3: false
	};
}

function compile(target, silent) {
	if (!silent) {
		channel.appendLine('Saving all files.');
		vscode.commands.executeCommand('workbench.action.files.saveAll');
	}

	if (!vscode.workspace.rootPath) {
		channel.appendLine('No project opened.');
		return;
	}

	if (!fs.existsSync(path.join(vscode.workspace.rootPath, 'kincfile.js')) && !fs.existsSync(path.join(vscode.workspace.rootPath, 'korefile.js'))) {
		channel.appendLine('No kincfile and no korefile found.');
		return;
	}

	if (!fs.existsSync(path.join(vscode.workspace.rootPath, 'khafile.js'))) {
		channel.appendLine('khafile found.');
		return;
	}

	let options = createOptions(target, fs.existsSync(path.join(vscode.workspace.rootPath, 'kincfile.js')) ? 'kincfile.js' : 'korefile.js');

	return require(path.join(findKinc(channel), 'Tools', 'kincmake', 'out', 'main.js'))
	.run(options, {
		info: message => {
			channel.appendLine(message);
		}, error: message => {
			channel.appendLine(message);
		}
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
}

function checkProject(rootPath) {
	if (!fs.existsSync(path.join(rootPath, 'kincfile.js')) && !fs.existsSync(path.join(rootPath, 'korefile.js'))) {
		return;
	}

	if (fs.existsSync(path.join(rootPath, 'khafile.js'))) {
		return;
	}

	if (findKinc() === path.join(vscode.extensions.getExtension('kodetech.kinc').extensionPath, 'Kinc')) {
		chmodEverything()
	}

	const options = createOptions(currentPlatform(), fs.existsSync(path.join(rootPath, 'kincfile.js')) ? 'kincfile.js' : 'korefile.js');
	options.vscode = true;
	options.noshaders = true;
	options.compile = false;

	const kinc = require(path.join(findKinc(), 'Tools', 'kincmake', 'out', 'main.js'))
	kinc.run(options, {
		info: message => {
			channel.appendLine(message);
		}, error: message => {
			channel.appendLine(message);
		}
	});

	const protoPath = path.join(rootPath, '.vscode', 'protolaunch.json');
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
	configuration.update('launch', config, false);
}

const KincTaskProvider = {
	provideTasks: () => {
		let workspaceRoot = vscode.workspace.rootPath;
		if (!workspaceRoot) {
			return [];
		}

		const systems = [
			{ arg: 'windows', name: 'Windows', default: false },
			{ arg: 'windows', name: 'Windows (Direct3D 12)', default: false, graphics: 'direct3d12' },
			{ arg: 'windows', name: 'Windows (Direct3D 9)', default: false, graphics: 'direct3d9' },
			{ arg: 'windows', name: 'Windows (Vulkan)', default: false, graphics: 'vulkan' },
			{ arg: 'windows', name: 'Windows (OpenGL)', default: false, graphics: 'opengl' },
			{ arg: 'windowsapp', name: 'Windows Universal', default: false },
			{ arg: 'osx', name: 'macOS', default: false },
			{ arg: 'osx', name: 'macOS (OpenGL)', default: false, graphics: 'opengl' },
			{ arg: 'linux', name: 'Linux', default: false },
			{ arg: 'linux', name: 'Linux (Vulkan)', default: false, graphics: 'vulkan' },
			{ arg: 'android', name: 'Android', default: false },
			{ arg: 'ios', name: 'iOS', default: false },
			{ arg: 'ios', name: 'iOS (OpenGL)', default: false, graphics: 'opengl' },
			{ arg: 'pi', name: 'Raspberry Pi', default: false },
			{ arg: 'tvos', name: 'tvOS', default: false },
			{ arg: 'tizen', name: 'Tizen', default: false },
			{ arg: 'html5', name: 'HTML5', default: false },
			{ arg: 'ps4', name: 'PlayStation 4', default: false },
			{ arg: 'xboxone', name: 'Xbox One', default: false },
			{ arg: 'switch', name: 'Switch', default: false },
			{ arg: 'ps5', name: 'PlayStation 5', default: false },
			{ arg: 'xboxscarlett', name: 'Xbox Series X|S', default: false },
			{ arg: 'stadia', name: 'Stadia', default: false }
		];

		let tasks = [];
		for (const system of systems) {
			let args = [system.arg];

			if (findFFMPEG().length > 0) {
				args.push('--ffmpeg');
				args.push(findFFMPEG());
			}

			args.push('--compile');

			if (system.graphics) {
				args.push('--graphics');
				args.push(system.graphics);
			}

			let kind = {
				type: 'Kinc',
				target: system.name,
			}

			let task = null;
			let kincmakePath = path.join(findKinc(), 'make.js');

			// On Windows, git bash shell won't accept backward slashes and will fail,
			// so we explicitly need to convert path to unix-style.
			const winShell = vscode.workspace.getConfiguration('terminal.integrated.shell').get('windows');
			if (os.platform() === 'win32' && winShell && winShell.indexOf('bash.exe') > -1) {
				kincmakePath = kincmakePath.replace(/\\/g, '/');
			}

			if (vscode.env.appName.includes('Kode')) {
				let exec = process.execPath;
				if (exec.indexOf('Kode Studio Helper') >= 0) {
					const dir = exec.substring(0, exec.lastIndexOf('/'));
					exec = path.join(dir, '..', '..', '..', '..', 'MacOS', 'Electron');
				}
				task = new vscode.Task(kind, `Build for ${system.name}`, 'Kinc', new vscode.ProcessExecution(exec, ['--kincmake', kincmakePath].concat(args), {cwd: workspaceRoot}), ['$msCompile']);
			}
			else {
				task = new vscode.Task(kind, vscode.TaskScope.Workspace, `Build for ${system.name}`, 'Kinc', new vscode.ShellExecution('node', [kincmakePath].concat(args)), ['$msCompile']);
			}
			task.group = vscode.TaskGroup.Build;
			tasks.push(task);
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

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'kincfile.js'))) {
			channel.appendLine('A Kinc project already exists in the project directory.');
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'korefile.js'))) {
			channel.appendLine('A Kinc project already exists in the project directory.');
			return;
		}

		if (fs.existsSync(path.join(vscode.workspace.rootPath, 'khafile.js'))) {
			channel.appendLine('A Kha project already exists in the project directory.');
			return;
		}

		require(path.join(findKinc(), 'Tools', 'kincmake', 'out', 'init.js')).run('Project', vscode.workspace.rootPath, 'kincfile.js');
		vscode.commands.executeCommand('workbench.action.reloadWindow');
		vscode.window.showInformationMessage('Kinc project created.');
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
