"""Independent, explicit Bitcoin choices. Order is not a ranking; no default."""
from types import MappingProxyType

from .models import BitcoinProvider

BITCOIN_PRODUCTS = MappingProxyType({
    BitcoinProvider.GCRYPTO: "gcrypto_btc",
    BitcoinProvider.COINS: "coins_btc",
    BitcoinProvider.PDAX: "pdax_btc",
})
