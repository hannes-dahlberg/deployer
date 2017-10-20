#Deployer
Deploy to remote host using SFTP. Is able to execute scripts pre and post upload process, both locally and remotely.

Create deployer.yml in your app root for configs.

Example content of deployer.yml:

```yml
host: 127.0.0.1
user: user
pass: secret
paths:
    local: .
    remote: /path/to/some/remote/folder
scripts:
    local:
        pre:
        post:
    remote:
        pre:
        post:
```
Specify array's for multiple scripts instead of string

You can also specify script file location with option -c (--config)

The script is using your computers global .gitignore as well as the .gitignore in project folder


##Limitations:
- Auth with user and password only at the moment
- All files are uploaded not just changed files

##Ideas for future:
- Only upload new files
- Specify files to ignore in config
- more yargs and password prompt
- ssh key auth