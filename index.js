#!/usr/bin/env node
let yaml = require('js-yaml')
let fs = require('fs')
let _ = require('lodash')
let node_ssh = require('node-ssh')
let shell = require('shelljs')
let countFiles = require('count-files')
let ignore = require('ignore')
var prompt = require('prompt')
let nodehelpers = require('nodehelpers')

var Prom = nodehelpers.prom
var Arr = nodehelpers.arr
var ProgressBar = nodehelpers.progressBar.progressBar

let argv = require('yargs').option('config', {
    alias: 'c',
    description: 'Path to yml config file',
    default: './deployer.yml'
}).argv



var configPath = argv.config

//Get Config file
if(fs.existsSync(configPath)) {
    var configs = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'))
} else {
    throw new Error('Config file "' + configPath + '" could not be found')
}

//Create ignore instance
var ig = ignore()

//Add gitignore to ig
if(fs.existsSync('.gitignore')) {
    ig.add(fs.readFileSync('.gitignore').toString())
}

var globalGitIgnorePath = shell.exec('git config --global core.excludesfile', { async: false, silent: true }).stdout.trim()
if(fs.existsSync(globalGitIgnorePath)) {
    ig.add(fs.readFileSync(globalGitIgnorePath).toString())
}

//Add the to ignore .git folder and the deployer script itself
ig.add('.git')
ig.add(configPath)

//Shorthand function for executing script localy or remote (ssh)
var executeScript = (handler, scripts, remote, remotePath) => {
    return new Promise((resolve, reject) => {
        if(typeof remote == 'undefined') { remote = false; }

        //Converts script to array if not
        if(!Arr.isArray(scripts)) { scripts = [scripts]; }

        //Contianer for promises
        var promises = []

        scripts.forEach(script => {
            if(!script) { return; }

            //Add each script execution as a promise to the promise container
            promises.push(() => {
                return new Promise((resolve, reject) => {
                    if(!remote) {
                        //Executing local script
                        handler.exec(script, { silent: true }, (code, stdout, stderr) => {
                            if(stderr) { reject(stderr); return; }
                            console.log(stdout.trim())
                            resolve(stdout.trim())
                        })
                    } else {
                        //Executing remote script
                        handler.execCommand(script, { cwd: remotePath }).then(result => {
                            if(result.stderr) { reject(new Error(result.stderr)); return; }
                            console.log(result.stdout.trim())
                            resolve(result.stdout.trim())
                        })
                    }

                })
            })
        })

        if(promises.length) {
            //Execute all scripts from promises container in sequence
            Prom.sequence(promises).then(result => resolve(result)).catch(error => reject(error))
        } else {
            resolve();
        }
    })
}

var exec = () => {
    //Create SSH instance
    var ssh = new node_ssh()

    Prom.sequence([
        //Pre local script
        () => new Promise((resolve, reject) => {
            if(configs.scripts.local.pre && configs.scripts.local.pre[0]) {
                console.log('Initiating execution of local scripts...')
                executeScript(shell, configs.scripts.local.pre).then(result => resolve(result)).catch(error => reject(error))
                return
            }

            resolve()
        }),
        //Connecting
        () => new Promise((resolve, reject) => {
            console.log('Connecting to sver through ssh...')
            ssh.connect({
                host: configs.host,
                username: configs.user,
                password: configs.pass
            }).then(() => {
                console.log('Connected!')
                resolve()
            }, error => {
                console.log('Connection failed!')
                reject(error)
            })
        }),
        //Pre remote script
        () => new Promise((resolve, reject) => {
            if(configs.scripts.remote.pre && configs.scripts.remote.pre[0]) {
                console.log('Initiating execution of remote scripts...')
                executeScript(ssh, configs.scripts.remote.pre, true, configs.paths.remote).then(result => resolve(result)).catch(error => reject(error))
                return
            }
            resolve()
        }),
        //Uploading folder
        () => new Promise((resolve, reject) => {
            console.log('Initiating file upload...')
            countFiles(configs.paths.local, {
                ignore(filePath) {
                    return !ig.filter(filePath).length;
                }
            }, (error, result) => {
                var bar = ProgressBar(result.files)
                ssh.putDirectory(configs.paths.local, configs.paths.remote, {
                    recursive: true,
                    concurrency: 1,
                    validate(itemPath) {
                        return ig.filter(itemPath).length;
                    },
                    tick(localPath, remotePath, error) {
                        if(error) { console.log(error); return; }
                        bar.tick()
                    }
                }).then(status => {
                    console.log('')
                    resolve()
                }, error => reject(error))
            })

        }),
        //Post remote script
        () => new Promise((resolve, reject) => {
            if(configs.scripts.remote.post && configs.scripts.remote.post[0]) {
                console.log('Initiating execution of remote scripts...')
                executeScript(ssh, configs.scripts.remote.post, true, configs.paths.remote).then(result => resolve(result)).catch(error => reject(error))
                return
            }
            resolve()
        }),
        //Post local script
        () => new Promise((resolve, reject) => {
            if(configs.scripts.local.post && configs.scripts.local.post[0]) {
                console.log('Initiating execution of local scripts...')
                executeScript(shell, configs.scripts.local.post).then(result => resolve(result)).catch(error => reject(error))
                return
            }
            resolve()
        })
    ]).then(result => {
        result = Arr.flatten(result)
        //Checks for errors
        if(result.some(_.isError)) {

            //Log all errors
            result.filter(_.isError).forEach(error => {
                console.log(error)
            })

            return
        }

        console.log('Done!')
        process.exit();
    })
}

exports.exec = exec